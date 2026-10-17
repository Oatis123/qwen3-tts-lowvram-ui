!define QTS_UPDATER_DIR "qwen-tts-studio-updater"

!macro customInstall
  ${If} ${FileExists} "$LOCALAPPDATA\${QTS_UPDATER_DIR}\installer.exe"
    CreateDirectory "$INSTDIR\UserData\cache\${QTS_UPDATER_DIR}"
    ClearErrors
    CopyFiles /SILENT "$LOCALAPPDATA\${QTS_UPDATER_DIR}\installer.exe" "$INSTDIR\UserData\cache\${QTS_UPDATER_DIR}"
    ${IfNot} ${Errors}
      Delete "$LOCALAPPDATA\${QTS_UPDATER_DIR}\installer.exe"
      RMDir "$LOCALAPPDATA\${QTS_UPDATER_DIR}"
    ${EndIf}
  ${EndIf}
!macroend

!macro qtsRemoveAppFiles
  FindFirst $R8 $R9 "$INSTDIR\*.*"
  ${DoWhile} $R9 != ""
    ${If} $R9 != "."
    ${AndIf} $R9 != ".."
    ${AndIf} $R9 != "UserData"
      ${If} ${FileExists} "$INSTDIR\$R9\*.*"
        RMDir /r "$INSTDIR\$R9"
      ${Else}
        Delete "$INSTDIR\$R9"
      ${EndIf}
    ${EndIf}
    FindNext $R8 $R9
  ${Loop}
  FindClose $R8
!macroend

!macro customRemoveFiles
  SetOutPath $TEMP
  !insertmacro qtsRemoveAppFiles
  ${IfNot} ${isUpdated}
    ${If} ${FileExists} "$INSTDIR\UserData\*.*"
      IfSilent qts_keep_data
      MessageBox MB_YESNO|MB_ICONQUESTION "Удалить также скачанные компоненты, модели, голоса и историю озвучек?$\r$\n$\r$\nЕсли выбрать «Нет», они останутся в папке:$\r$\n$INSTDIR\UserData$\r$\n$\r$\nПри повторной установке в ту же папку программа подхватит их." /SD IDNO IDNO qts_keep_data
      RMDir /r "$INSTDIR\UserData"
      qts_keep_data:
    ${EndIf}
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
