// Synthetic local fixtures only. IDs are stable so screenshots can be compared.
export const roles = ['admin', 'athlete', 'guardian', 'coach', 'multi'];
const namespace = process.env.ASISTEAM_QA_NAMESPACE;
if (namespace && !/^[a-f0-9]{8}$/.test(namespace)) throw new Error('Namespace QA inválido');
export const email = role => `qa120-${namespace ? namespace + '-' : ''}${role}@qa120.example.test`;
export const password = 'QA120-Synthetic-only-Password!';
export const id = number => `${namespace ?? '01200000'}-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const inviteCode = index => namespace ? namespace.slice(0, 7) + index : `QA12000${index}`;
export const fixtureFlowCode = namespace ? namespace.slice(0, 7) + 'F' : 'QA100E2E';
export const groups = { empty: id(1), single: id(2), fifty: id(3), large: id(4) };
export const activity = group => id(100 + Object.values(groups).indexOf(group));
export const rosterName = number => `Deportista QA ${String(number).padStart(3, '0')}`;
export const pendingName = 'Menor QA pendiente';
export const wardName = 'Pupilo QA con consentimiento';
