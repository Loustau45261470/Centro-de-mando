' Abre Centro de Mando en ventana propia de Chrome (--app: sin barra de direcciones ni pestañas).
'
' Sin argumentos -> abre la app publicada (GitHub Pages). Es la unica que muestra datos:
'   App Check esta en modo ENFORCED para Firestore y la clave de reCAPTCHA solo autoriza
'   ese dominio, asi que desde localhost la nube responde permission-denied y la app queda
'   vacia (comprobado el 2026-08-16). Para habilitar localhost hay que agregarlo como
'   dominio de la clave reCAPTCHA / token de debug en la consola de Firebase.
'
' Con el argumento "local" -> levanta el servidor estatico en localhost:8787 (sin ventana de
' consola) y abre eso. Sirve para tocar HTML/CSS/JS; los datos van a aparecer vacios.
Option Explicit

Dim sh, fso, raiz, url, chrome, modo
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

raiz = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

modo = ""
If WScript.Arguments.Count > 0 Then modo = LCase(WScript.Arguments(0))

If modo = "local" Then
  url = "http://localhost:8787/"
  sh.CurrentDirectory = raiz
  ' 0 = ventana oculta, False = no esperar. Si el puerto ya esta ocupado, python sale solo.
  sh.Run "python -m http.server 8787 --bind 127.0.0.1", 0, False
  WScript.Sleep 1200
Else
  url = "https://loustau45261470.github.io/Centro-de-mando/"
End If

chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
If fso.FileExists(chrome) Then
  sh.Run """" & chrome & """ --app=" & url, 1, False
Else
  sh.Run url, 1, False
End If
