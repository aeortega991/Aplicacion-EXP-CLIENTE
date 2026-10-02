# SSO con Active Directory / Microsoft 365 (Microsoft Entra ID)

Permite iniciar sesión con las **cuentas corporativas de la organización** (las mismas
de Outlook / Microsoft 365), además del login por usuario y contraseña ya existente.

> Estado: **listo a nivel de código**. El SSO permanece **desactivado** hasta que se
> configuren las variables `ENTRA_*` en `backend/.env`. Mientras tanto:
> - `GET /api/auth/microsoft/config` devuelve `{"enabled": false}`
> - El botón "Iniciar sesión con Microsoft" **no se muestra** en la pantalla de login
> - `GET /api/auth/microsoft/login` responde `404`
> - El login por usuario/contraseña sigue funcionando sin cambios

## 1. Registrar la aplicación en Microsoft Entra

1. Entra a **Microsoft Entra admin center → App registrations → New registration**.
2. Tipo de cuenta: **Accounts in this organizational directory only** (single-tenant).
3. **Authentication → Add a platform → Web**, y agrega como Redirect URI exactamente:
   `https://TU-DOMINIO/api/auth/microsoft/callback`
   (en preview: `https://continuemos-aqui.preview.emergentagent.com/api/auth/microsoft/callback`)
4. **Certificates & secrets → New client secret** → copia el **Value** (no el ID).
5. Copia **Application (client) ID** y **Directory (tenant) ID** de la pestaña Overview.
6. Permisos de Graph: no se requieren; basta con `openid profile email`.

## 2. Configurar `backend/.env`

```
ENTRA_TENANT_ID="<Directory (tenant) ID>"
ENTRA_CLIENT_ID="<Application (client) ID>"
ENTRA_CLIENT_SECRET="<Client secret Value>"
ENTRA_REDIRECT_URI="https://TU-DOMINIO/api/auth/microsoft/callback"
ENTRA_POST_LOGIN_REDIRECT="https://TU-DOMINIO"   # opcional; por defecto usa APP_BASE_URL
ENTRA_AUTO_PROVISION="false"   # ver sección 4
ENTRA_DEFAULT_ROLE="user"
```

Luego reiniciar el backend: `sudo supervisorctl restart backend`.

## 3. Cómo funciona el flujo

1. El usuario pulsa "Iniciar sesión con Microsoft" → `/api/auth/microsoft/login`.
2. Se redirige a Microsoft (OAuth2 Authorization Code). El `state`/`nonce` se guardan en
   `db.oauth_states` (con índice TTL de 10 min).
3. Microsoft regresa a `/api/auth/microsoft/callback`. El backend valida el token con MSAL
   y comprueba `aud` (client id) y `tid` (tenant) exactos.
4. Toma el correo (`preferred_username`/`email`) y lo **vincula con un usuario existente**
   (búsqueda por `email`, sin distinguir mayúsculas). Los roles se siguen gestionando dentro
   de la app.
5. Emite el **mismo JWT** de la aplicación y redirige a `/sso/callback#token=...`, donde el
   frontend lo guarda igual que un login normal.

## 4. Vinculación de usuarios y roles

- El correo de la cuenta de Microsoft debe coincidir con el campo **Correo** del usuario en
  el módulo **Usuarios**. Asegúrate de cargar el correo corporativo de cada usuario.
- Si el correo **no existe**, el comportamiento depende de `ENTRA_AUTO_PROVISION`:
  - `false` (por defecto): se rechaza el acceso con el mensaje "usuario no registrado".
  - `true`: se crea automáticamente un usuario con rol `ENTRA_DEFAULT_ROLE` (por defecto `user`)
    y sin contraseña (solo accede por SSO). Útil si se quiere acceso abierto a toda la
    organización con rol básico.

## 5. Seguridad

- El `client secret` vive **solo** en el backend; nunca llega al navegador.
- Validación de token delegada a MSAL + verificación explícita de audiencia y tenant.
- El `redirect_uri` debe coincidir **exactamente** con el registrado en Entra.
- El `state` se consume una sola vez (`find_one_and_delete`) como defensa anti-replay.
