# Guía: activar el botón "Actualizar" de la Cartera

Tiempo total: unos 20 minutos tuyos, más la espera de IOL (puede tardar uno o más días hábiles).

Hay dos partes:

- **Parte A** se puede hacer ya.
- **Parte B** se hace cuando te avise que el código nuevo está listo.

> **Regla de oro:** tu usuario y tu contraseña de IOL solo se escriben en la terminal de tu computadora, cuando la terminal los pida. Nunca en un chat (tampoco conmigo), ni en un archivo, ni en un mail.

---

## Parte A — Preparar las cuentas (se puede hacer ya)

### A1. API de IOL habilitada — ✅ ya lo tenés

Me confirmaste que la API ya está activa (es la que usa Claude para conectarse a IOL), así que este paso se saltea. Lo dejo escrito por si algún día la desactivan.

**Si IOL pide un código de verificación:** a veces lo pide al iniciar sesión. Si lo pide justo cuando entra el Worker, el ingreso falla y el botón muestra un aviso. Para no bloquear tu cuenta con intentos repetidos, el Worker espera 10 minutos antes de volver a probar con tu contraseña. Si te pasa seguido, avisame.

<details><summary>Cómo se habilita (solo si hiciera falta)</summary>

IOL no deja que un programa consulte tu cartera hasta que vos lo pedís.

1. Entrá a <https://www.invertironline.com/> e iniciá sesión como siempre.
2. Buscá la sección **Mensajes** (en el menú de tu cuenta, suele ser un ícono de sobre).
3. Mandá un mensaje nuevo con este texto (podés copiarlo tal cual):

   > Hola, quisiera solicitar la activación de las APIs en mi cuenta para consultar mi portafolio desde una aplicación personal. Gracias.

4. Esperá la respuesta de IOL. Puede tardar uno o más días hábiles.
5. Cuando te confirmen, entrá a **Mi Cuenta → Personalización → APIs** y aceptá los términos y condiciones. Sin ese paso la API no funciona aunque la hayan habilitado.

Documentación oficial de IOL sobre esto:

- <https://www.invertironline.com/api>
- <https://api.invertironline.com/>

</details>

### A2. Activar la verificación en dos pasos en Cloudflare

Es el candado que protege el lugar donde va a quedar guardada tu contraseña de IOL.

1. Entrá a <https://dash.cloudflare.com/> con la cuenta donde está el Worker. Es la que usa la dirección `tobiasloustau11` (la misma de los avisos del Pomodoro).
2. Revisá que tu email esté **verificado**: Cloudflare lo exige antes de activar los dos pasos.
3. Andá directo a <https://dash.cloudflare.com/profile/authentication>. Si no, arriba a la derecha: ícono de persona → **My Profile** → **Authentication**.
4. En **Mobile App Authentication** tocá **Add**.
5. Escaneá el código QR con una app de códigos (en el iPhone sirven **Google Authenticator** o **Microsoft Authenticator**, gratis en el App Store) y escribí el código de 6 dígitos que te muestra.
6. Cloudflare te va a pedir la contraseña dos veces y después te muestra unos **códigos de recuperación**. **Guardalos** en un lugar seguro, por ejemplo en las notas bloqueadas del iPhone. Si perdés el celular, son la única forma de volver a entrar.

Guía oficial de Cloudflare: <https://developers.cloudflare.com/fundamentals/user-profiles/2fa/>

### A3. Anotar tu identificador de usuario de la app (UID)

Es un código que identifica tu cuenta de Google dentro del Centro de Mando. Con él, el Worker le responde solo a vos.

1. Entrá a <https://console.firebase.google.com/project/centro-de-mando-bdc7d/authentication/users>.
2. Vas a ver una tabla con tu email. Copiá lo que dice en la columna **User UID** (un texto largo de letras y números).
3. Guardalo a mano: lo vas a pegar en la Parte B. No es una contraseña, pero tampoco hace falta compartirlo.

---

## Parte B — Cargar las credenciales y publicar (cuando te avise)

Todo esto se hace en tu computadora HP, dentro de VS Code.

### B1. Abrir la terminal en la carpeta correcta

1. En VS Code, menú **Terminal → New Terminal**. Se abre abajo una consola (PowerShell).
2. Pegá esto y apretá Enter:

   ```powershell
   cd "C:\Users\Tobias\Desktop\Claude\Proyectos\Activos\Centro de comando\cf-worker"
   ```

### B2. Conectar la terminal con tu cuenta de Cloudflare

```powershell
npx wrangler login
```

- Se abre el navegador con una página de Cloudflare. Iniciá sesión (ahora te va a pedir el código de 6 dígitos de la app) y tocá **Allow**.
- Volvé a VS Code: la terminal dice que te conectaste ("Successfully logged in").

### B3. Cargar los tres datos secretos

Corré **cada línea por separado**. Después de cada una, la terminal te pide el valor ("Enter a secret value"). Pegalo y apretá Enter. Lo que pegás puede no verse en pantalla: es normal.

```powershell
npx wrangler secret put IOL_USER
```
→ pegá tu **usuario de IOL** (con el que entrás a la web).

```powershell
npx wrangler secret put IOL_PASS
```
→ pegá tu **contraseña de IOL**.

```powershell
npx wrangler secret put OWNER_UID
```
→ pegá el **User UID** que copiaste en A3.

Cada uno tiene que terminar con un mensaje tipo "✨ Success! Uploaded secret ...".

Los secretos quedan cifrados en Cloudflare. Ni el código, ni GitHub, ni yo podemos leerlos. Si alguna vez cambiás la contraseña de IOL, repetí solo la línea de `IOL_PASS`.

### B4. Publicar la versión nueva del Worker

```powershell
npx wrangler deploy
```

Tiene que terminar mostrando una dirección `https://cdm-push-worker.tobiasloustau11.workers.dev` y un "Current Version ID". Los avisos de Pomodoro y del gimnasio siguen funcionando igual: viven en el mismo Worker.

### B5. Probar

1. Abrí el Centro de Mando (en la compu o en el iPhone): <https://loustau45261470.github.io/Centro-de-mando/>
2. Finanzas → **Cartera** → pestaña **Mis tenencias** → botón **Actualizar**.
3. Si sale bien, arriba del total dice "Actualizado a las HH:MM" con la hora de ahora.
4. Avisame. Yo comparo lo que trajo el botón con tu cartera real (la leo con el conector de IOL en modo solo lectura), para confirmar que los números coinciden.

### Si algo sale mal

| Mensaje que ves | Qué significa | Qué hacer |
|---|---|---|
| "El Worker no tiene configuradas las credenciales de IOL" | Falta `IOL_USER` o `IOL_PASS` | Repetí B3 |
| "El Worker no tiene configurado el secret OWNER_UID" | Falta el UID | Repetí la tercera línea de B3 |
| "Este endpoint es privado" | El UID cargado no es el tuyo | Volvé a copiar el UID (A3) y repetí la tercera línea de B3 |
| "No se pudo obtener la cartera desde IOL… login IOL falló" | IOL rechazó el ingreso: contraseña mal escrita, IOL pidió un código de verificación o la API se desactivó | Repetí la línea de `IOL_PASS` en B3. El Worker reintenta solo a los 10 min |
| "…Para no bloquear tu cuenta, el próximo intento es en N min" | Hubo un ingreso rechazado hace poco y el Worker está esperando a propósito | Esperá esos minutos. Si cambiaste algo en B3, después tocá Actualizar |
| "Esperá unos segundos antes de volver a actualizar" | El intento anterior falló y tocaste Actualizar de nuevo en menos de 30 segundos | Esperá medio minuto. Si el intento anterior había salido bien, un segundo toque antes de 30 segundos no muestra este mensaje: muestra lo mismo que ya tenías, sin consultar IOL |
| `wrangler` pide login otra vez o da "Authentication error" | La terminal perdió la conexión con Cloudflare | Repetí B2 |

Si te aparece algo que no está en la tabla, copiame el mensaje, **sin** tus credenciales.

---

## ¿Qué es el Worker y cómo funciona sin una IA?

Un Worker es un programa chico que vive en los servidores de Cloudflare y se despierta solo cuando alguien lo llama. No piensa: sigue una receta fija, siempre la misma, como una máquina expendedora.

Cuando tocás **Actualizar**:

1. **La app manda el pedido.** Le pide la cartera al Worker y adjunta una "credencial" que Google le dio a tu sesión.
2. **El Worker comprueba la credencial.** Revisa que la haya firmado Google y que sea tu cuenta (tu UID). Si no, contesta "privado" y corta.
3. **El Worker entra a IOL.** Lo hace con el usuario y la contraseña guardados y recibe un pase que dura unos 15 minutos.
4. **Pide tu portafolio** con ese pase.
5. **Ordena la respuesta** al formato que usa la app y te la devuelve. Tarda segundos.

No hace falta IA porque no hay nada que decidir: siempre son los mismos pasos. La IA hizo falta para **escribir** la receta. Una vez escrita, la ejecuta la computadora de Cloudflare, gratis (el plan gratuito permite 100.000 pedidos por día y vos vas a usar unos pocos).

La rutina semanal sí corre con Claude porque hace un trabajo más largo: reconstruye cuándo compraste cada lote mirando todo tu historial de operaciones. El botón trae lo de ahora (cantidades, precios, valor) y lo combina con esos lotes semanales, así no se pierde nada.
