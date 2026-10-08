import { z } from 'zod';
import { registerSchema } from './schemas/register';
import { socialLoginContextSchema } from './schemas/login';
import { loginSchema } from './schemas/login';
const token = z.string().regex(/^[a-f0-9]{64}$/);
export const authHttpSchemas = {
  SocialProviders: z.object({google:z.boolean(),apple:z.boolean()}).strict(),
  SocialStart: z.object({provider:z.enum(['google','apple']),context:socialLoginContextSchema.default({})}).strict(),
  SocialStarted: z.object({authorization_url:z.string().url(),transaction:z.string().min(1).max(3800)}).strict(),
  SocialCallback: z.object({provider:z.enum(['google','apple']),code:z.string().min(1).max(4096),state:z.string().min(1).max(256),transaction:z.string().min(1).max(3800)}).strict(),
  SocialCompleted: z.object({tokens:z.object({access_token:z.string().min(1).max(16384),refresh_token:token,expires_in:z.literal(900)}).strict(),context:socialLoginContextSchema,linked:z.boolean()}).strict(),
  AuthLogin: loginSchema.extend({ password: z.string().min(1).max(128) }).strict(),
  AuthRegister: registerSchema.strict(),
  AuthRecovery: z.object({email:z.string().trim().email().max(254)}).strict(),
  AuthReset: z.object({token,password:registerSchema.shape.password}).strict(),
  AuthPassword: z.object({current_password:z.string().min(1).max(128),password:registerSchema.shape.password}).strict(),
  AuthRefresh: z.object({refresh_token:token}).strict(),
  AuthTokens: z.object({access_token:z.string().min(1).max(16384),refresh_token:token,expires_in:z.literal(900)}).strict(),
  AuthRecoveryResult: z.object({message:z.literal('Si el email existe, enviamos instrucciones')}).strict(),
};
const common={module:'auth',status:200,state:'implemented'} as const;
export const authHttpOperations = {
  getSocialProviders:{...common,method:'GET',path:'/api/v1/auth/social/providers',authenticated:false,response:'SocialProviders',summary:'Capacidades públicas OAuth sin secretos'},
  startSocialLogin:{...common,method:'POST',path:'/api/v1/auth/social/start',authenticated:false,body:'SocialStart',response:'SocialStarted',summary:'Inicia OAuth con state/nonce y contexto cifrado'},
  startSocialLink:{...common,method:'POST',path:'/api/v1/auth/social/link',authenticated:true,body:'SocialStart',response:'SocialStarted',summary:'Vinculación explícita desde sesión propia vigente'},
  completeSocialLogin:{...common,method:'POST',path:'/api/v1/auth/social/callback',authenticated:false,body:'SocialCallback',response:'SocialCompleted',summary:'Valida proveedor y transacción y crea sesión atómica sin fusión por email'},
  loginPassword:{...common,method:'POST',path:'/api/v1/auth/login',authenticated:false,body:'AuthLogin',response:'AuthTokens',summary:'Login independiente con límite y respuesta genérica'},
  registerPassword:{...common,method:'POST',path:'/api/v1/auth/register',authenticated:false,body:'AuthRegister',response:'Success',summary:'Registro de perfil, credencial y aceptación transaccional'},
  requestRecovery:{...common,method:'POST',path:'/api/v1/auth/recovery',authenticated:false,body:'AuthRecovery',response:'AuthRecoveryResult',summary:'Recovery de un uso y respuesta anti-enumeración'},
  resetPassword:{...common,method:'POST',path:'/api/v1/auth/reset',authenticated:false,body:'AuthReset',response:'Success',summary:'Consumo y sustitución de contraseña atómicos'},
  refreshSession:{...common,method:'POST',path:'/api/v1/auth/refresh',authenticated:false,body:'AuthRefresh',response:'AuthTokens',summary:'Refresh rotatorio; replay revoca familia'},
  logoutSession:{...common,method:'POST',path:'/api/v1/auth/logout',authenticated:true,response:'Success',summary:'Revoca familia actual y sus access tokens'},
  changePassword:{...common,method:'POST',path:'/api/v1/auth/password',authenticated:true,body:'AuthPassword',response:'Success',summary:'Contraseña actual y revocación de todas las sesiones'},
} as const;
