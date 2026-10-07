"""Validate MIG-01 evidence against its pinned Git base; no provider access.

Run from any directory: python3 docs/migration/issue-145/validate.py
Only reads paths explicitly referenced by this documentary deliverable.
"""
import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DOCUMENTS = ["README.md", "contracts.md", "runtime.md", "adr-001.md",
             "infrastructure.md", "evidence.md"]
SNAPSHOT = json.loads((HERE / "inventory.json").read_text())
PRICING = json.loads((HERE / "pricing.json").read_text())
BASE = SNAPSHOT["base_commit"]
CACHE = {}


def check(condition, message):
    if not condition:
        raise ValueError(message)


def source(path):
    """Read an explicitly inventoried blob, never an env or provider credential."""
    check(path.startswith(("apps/web/", "packages/db/", "supabase/")), path)
    check(not any(part.startswith(".env") for part in Path(path).parts), "env files are not evidence")
    if path not in CACHE:
        CACHE[path] = subprocess.check_output(
            ["git", "show", f"{BASE}:{path}"], cwd=ROOT)
    return CACHE[path]


hashes = dict(SNAPSHOT["source_sha256"])
for migration in SNAPSHOT["sql"]["migrations"]:
    hashes[migration["file"]] = migration["sha256"]
for path, expected in hashes.items():
    check(hashlib.sha256(source(path)).hexdigest() == expected, f"Hash: {path}")
    check((ROOT / path).is_file(), f"Missing checkout source: {path}")
    check(hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected,
          f"Checkout changed from inventoried base: {path}")
print(f"PASS: {len(hashes)} source hashes (Git base and checkout)")

refs = 0
for category in ["web_rpc", "postgrest", "auth", "storage", "edge_http",
                 "edge_rpc", "environment"]:
    for name, consumers in SNAPSHOT[category].items():
        for ref in consumers:
            lines = source(ref["file"]).decode().splitlines()
            line = ref["line"]
            check(1 <= line <= len(lines), f"Line: {ref}")
            # Some calls place their argument on the next line; wrapper metadata
            # still points to the call's first line.
            window = "\n".join(lines[line - 1:line + 4])
            check(name in window, f"Reference {category}/{name}: {ref}")
            refs += 1
print(f"PASS: {refs} named consumer references")

sql = SNAPSHOT["sql"]
latest = {}
declarations = 0
for migration in sql["migrations"]:
    lines = source(migration["file"]).decode().splitlines()
    for function in migration["functions"]:
        name = function["name"]
        check(name in lines[function["line"] - 1], f"SQL declaration: {name}")
        latest[name] = (migration["file"], function["line"])
        declarations += 1
check(set(latest) == set(sql["functions"]), "SQL function set")
for name, function in sql["functions"].items():
    check(latest[name] == (function["file"], function["line"]), f"Latest SQL: {name}")
    for key in ["destination", "delivery_issue", "treatment", "owner", "required_validation"]:
        check(bool(function[key]), f"SQL treatment {name}/{key}")
    for path in function["tests_referencing_name"]:
        check(name.split(".")[-1] in source(path).decode(), f"SQL test reference: {name}")
for path in sql["pgtap_files"]:
    source(path)
print(f"PASS: {declarations} SQL declarations / {len(latest)} names / {len(sql['pgtap_files'])} pgTAP references")

contracts = SNAPSHOT["web_rpc_contracts"]
check({c["name"] for c in contracts} == set(SNAPSHOT["web_rpc"]), "RPC matrix set")
check(len(contracts) == len(SNAPSHOT["web_rpc"]), "Duplicate RPC contract")
for contract in contracts:
    for key in ["method", "endpoint", "dto", "current_sql_type", "permission",
                "effect_and_parity_test", "owner", "delivery_issue"]:
        check(bool(contract[key]), f"Contract {contract['name']}/{key}")
    check(contract["consumers"] == SNAPSHOT["web_rpc"][contract["name"]], "Consumers")
    check("Args:" in contract["current_sql_type"] and "Returns:" in contract["current_sql_type"], "SQL signature")
    check(contract["current_sql_type"] in source("packages/db/src/database.types.ts").decode(), "SQL signature differs from generated types")
    check(contract["endpoint"].startswith("/api/v1/"), "API version")
    for path in contract["tests"] + contract["display_tests"]:
        source(path)
print(f"PASS: {len(contracts)} RPC contracts with destination, signature, permission, tests and owner role")

counts = SNAPSHOT["counts"]
for key, actual in {
    "web_rpc_total": len(SNAPSHOT["web_rpc"]),
    "postgrest_targets": len(SNAPSHOT["postgrest"]),
    "auth_methods": len(SNAPSHOT["auth"]),
    "edge_functions": len(SNAPSHOT["edge_entrypoints"]),
    "migrations": len(sql["migrations"]),
    "function_names": len(latest), "function_declarations": declarations,
    "pgtap_files": len(sql["pgtap_files"]),
    "versioned_storage_buckets": len(SNAPSHOT["storage"]),
}.items():
    check(counts[key] == actual, f"Count: {key}")
check(counts["web_rpc_direct_names"] + counts["web_rpc_conditional_names"] == len(contracts), "RPC counts")
for name, path in SNAPSHOT["edge_entrypoints"].items():
    check(path == f"supabase/functions/{name}/index.ts", "Edge entrypoint path")
    check(path in hashes, "Missing Edge entrypoint hash")
for category, tests in [("postgrest", "postgrest_tests"), ("auth", "auth_tests")]:
    check(set(SNAPSHOT[category]) == set(SNAPSHOT[tests]), f"Test mapping: {category}")
    for paths in SNAPSHOT[tests].values():
        check(bool(paths), "Missing related suite")
        for path in paths:
            source(path)
print("PASS: snapshot count consistency / 6 hashed Edge entrypoints / PostgREST and Auth suite references")

links = 0
tables = 0
for name in DOCUMENTS:
    document = HERE / name
    text = document.read_text()
    check(text.count("```") % 2 == 0, f"Code fences: {name}")
    for target in re.findall(r"\]\(([^)]+)\)", text):
        parsed = urlsplit(target)
        if parsed.scheme or target.startswith("#"):
            continue
        path = (document.parent / unquote(parsed.path)).resolve()
        check(path.is_relative_to(ROOT), f"Out-of-repo link: {target}")
        check(path.exists(), f"Broken link: {name}/{target}")
        links += 1
    width = None
    for line in text.splitlines():
        if not line.startswith("|"):
            width = None
            continue
        cells = len(re.split(r"(?<!\\)\|", line)) - 2
        if width is None:
            width = cells
        check(cells == width, f"Table columns: {name}/{line}")
        tables += 1
print(f"PASS: {links} local links / {tables} table rows / closed code fences")

D = Decimal
rds = PRICING["rds"]["rows"]
s3 = PRICING["s3"]["rows"]
check(len(rds) == 4 and len(s3) == 3, "Price rows")
for section in ["rds", "s3"]:
    check("/sa-east-1/" in PRICING[section]["source"], "Price region")
    for row in PRICING[section]["rows"]:
        check(bool(row["sku"]) and D(row["usd"]) > 0, "SKU/rate")
small = D(next(r["usd"] for r in rds if r["instance_type"] == "db.t4g.small"))
micro = D(next(r["usd"] for r in rds if r["instance_type"] == "db.t4g.micro"))
gp3 = D(next(r["usd"] for r in rds if r["volume_type"] == "General Purpose-GP3"))
backup = D(next(r["usd"] for r in rds if r["family"] == "Storage Snapshot"))
store = D(next(r["usd"] for r in s3 if r["family"] == "Storage"))
get = D(next(r["usd"] for r in s3 if r["group"] == "S3-API-Tier2"))
put = D(next(r["usd"] for r in s3 if r["group"] == "S3-API-Tier1"))
subtotal = D(24 + 12 + 20) + 730 * (small + micro) + 40 * gp3 + 10 * backup + D("1.5") + 40 * store + 100000 * get + 10000 * put
check(subtotal == D("144.146"), "Infrastructure subtotal")
check((subtotal + 25).quantize(D(".01"), rounding=ROUND_HALF_UP) == D("169.15"), "Coexistence subtotal")
print(f"PASS: 7 regional snapshot rates / subtotal USD {subtotal} (not a current provider quote)")
print("PASS: documentary validation; runtime, external integrations and acceptance not exercised")
