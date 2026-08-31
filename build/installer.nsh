!macro customInit
  ; Check if .NET 8.0 Desktop Runtime is already installed
  ; Method 1: Check if dotnet.exe exists in standard system location
  IfFileExists "C:\Program Files\dotnet\dotnet.exe" dotnet_found dotnet_not_found_system
  Goto dotnet_not_found_user

  dotnet_not_found_system:
    ; Method 2: Check if dotnet.exe exists in user profile
    IfFileExists "$PROFILE\.dotnet\dotnet.exe" dotnet_found dotnet_not_found_user

  dotnet_not_found_user:
    ; Method 3: Check registry for Microsoft.WindowsDesktop.App shared framework
    SetRegView 64
    ReadRegStr $0 HKLM "SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App" ""
    StrCmp $0 "" 0 dotnet_found

    ; Method 4: Check WOW6432Node
    ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App" ""
    StrCmp $0 "" 0 dotnet_found

    ; Not found - need to download and install .NET 8.0 Desktop Runtime
    MessageBox MB_YESNO|MB_ICONQUESTION "Nuzlocke Overlay requiere .NET 8.0 Desktop Runtime para funcionar.$\r$\n$\r$\nSe descargara e instalara automaticamente (~60MB).$\r$\n$\r$\nContinuar?" IDYES download_dotnet IDNO dotnet_cancel

  download_dotnet:
    DetailPrint "Descargando .NET 8.0 Desktop Runtime..."
    NSISdl::download /TIMEOUT 180000 "https://download.microsoft.com/download/9f887fdb-93b3-4b8d-8c68-c68c37d991d8/248c8e1c-3dee-4902-b593-3aee3e9f64dc/windowsdesktop-runtime-8.0.30-win-x64.exe" "$TEMP\dotnet-runtime-8.0.exe"
    Pop $0
    StrCmp $0 "success" download_ok download_fail

  download_fail:
    DetailPrint "Error descargando .NET: $0"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Error al descargar .NET 8.0.$\r$\n$\r$\nPor favor, instala manualmente desde:$\r$\nhttps://dotnet.microsoft.com/download/dotnet/8.0$\r$\n$\r$\nBusca 'Desktop Runtime 8.0.x' y descarga el instalador."
    Goto dotnet_done

  download_ok:
    DetailPrint "Instalando .NET 8.0 Desktop Runtime (esto puede tardar)..."
    MessageBox MB_OK|MB_ICONINFORMATION "Se instalara .NET 8.0 Desktop Runtime en segundo plano.$\r$\nPulsa OK para continuar."
    ExecWait '"$TEMP\dotnet-runtime-8.0.exe" /quiet /norestart' $0
    DetailPrint "Codigo de resultado: $0"
    StrCmp $0 "0" install_ok check_reboot

  check_reboot:
    StrCmp $0 "3010" install_ok install_fail

  install_fail:
    DetailPrint "Instalacion de .NET fallida (codigo: $0)"
    MessageBox MB_OK|MB_ICONEXCLAMATION "La instalacion de .NET 8.0 pudo no completarse (codigo: $0).$\r$\n$\r$\nInstala manualmente desde:$\r$\nhttps://dotnet.microsoft.com/download/dotnet/8.0$\r$\n$\r$\nBusca 'Desktop Runtime 8.0.x'."
    Goto dotnet_done

  install_ok:
    DetailPrint ".NET 8.0 Desktop Runtime instalado correctamente."
    Delete "$TEMP\dotnet-runtime-8.0.exe"
    Goto dotnet_done

  dotnet_cancel:
    MessageBox MB_OK|MB_ICONINFORMATION "Puedes instalar .NET 8.0 despues desde:$\r$\nhttps://dotnet.microsoft.com/download/dotnet/8.0$\r$\n$\r$\nSin .NET, la app no podra leer los saves de Pokemon."

  dotnet_found:
    DetailPrint ".NET 8.0 Desktop Runtime ya esta instalado."

  dotnet_done:
!macroend
