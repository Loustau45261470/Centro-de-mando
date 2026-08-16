' Abre Centro de Mando en local.
' Levanta el servidor estatico de Python en localhost:8787 SIN ventana de consola
' y abre Chrome ahi. Si el servidor ya estaba corriendo, python sale solo y solo abre Chrome.
' Se usa localhost (no 127.0.0.1) porque es el dominio autorizado por defecto en Firebase Auth.
Option Explicit

Dim sh, fso, raiz, url, chrome
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

raiz = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
url  = "http://localhost:8787/"

sh.CurrentDirectory = raiz
' 0 = ventana oculta, False = no esperar.
sh.Run "python -m http.server 8787 --bind 127.0.0.1", 0, False
WScript.Sleep 1200

chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
If fso.FileExists(chrome) Then
  sh.Run """" & chrome & """ --new-window " & url, 1, False
Else
  sh.Run url, 1, False
End If
