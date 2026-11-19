; Hooks of the Windows installer (INT-01 L5, ADR-0054 §4), included by the
; NSIS script Tauri generates (bundle.windows.nsis.installerHooks, set only in
; tauri.installer.conf.json, which scripts/build-installer.mjs merges in).
;
; The command line ships as $INSTDIR\bin\pharos.exe. Installing puts that
; folder on the user's PATH and uninstalling takes it off. The CLI edits the
; PATH itself (`pharos setup-path add|remove <dir>`): strings in this NSIS
; build are at most 1024 characters, shorter than many PATHs, and editing it
; here could truncate it. A failure never stops the installer: it is logged
; and the manual explains how to call pharos.exe by its full path.

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Pharos: añadiendo $INSTDIR\bin al PATH del usuario"
  nsExec::ExecToLog '"$INSTDIR\bin\pharos.exe" setup-path add "$INSTDIR\bin"'
  Pop $0
  StrCmp $0 "0" +2 0
    DetailPrint "Pharos: no se pudo añadir $INSTDIR\bin al PATH ($0). El CLI se puede usar con su ruta completa."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  IfFileExists "$INSTDIR\bin\pharos.exe" 0 +3
    nsExec::ExecToLog '"$INSTDIR\bin\pharos.exe" setup-path remove "$INSTDIR\bin"'
    Pop $0
!macroend
