!ifndef BUILD_UNINSTALLER
  Var OpenChurchTermsAccepted

  Function RememberOpenChurchTerms
    StrCpy $OpenChurchTermsAccepted "yes"
  FunctionEnd

  !macro customWelcomePage
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE RememberOpenChurchTerms
    !insertmacro MUI_PAGE_LICENSE "${BUILD_RESOURCES_DIR}\terms-and-conditions.txt"
  !macroend

  !macro customInstall
    ${If} $OpenChurchTermsAccepted == "yes"
    ${AndIf} $installMode == "CurrentUser"
      Push $0
      CreateDirectory "$APPDATA\DualCast Studio"
      ClearErrors
      FileOpen $0 "$APPDATA\DualCast Studio\terms-accepted-version" w
      ${IfNot} ${Errors}
        FileWrite $0 "${VERSION}"
        FileClose $0
      ${EndIf}
      Pop $0
    ${EndIf}
  !macroend
!endif
