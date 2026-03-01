; LauncherChef Custom NSIS Installer Script
; Dark theme with green neon (#00FF41) accents

; ============================================================
;  BRANDING
; ============================================================
BrandingText "LauncherChef v2.1.0"

; ============================================================
;  MUI TEXT CUSTOMIZATION (guarded to avoid duplicates)
; ============================================================

!ifndef MUI_WELCOMEPAGE_TITLE
  !define MUI_WELCOMEPAGE_TITLE "Welcome to LauncherChef"
!endif

!ifndef MUI_WELCOMEPAGE_TEXT
  !define MUI_WELCOMEPAGE_TEXT "This wizard will install LauncherChef on your computer.$\r$\n$\r$\nLauncherChef is your ultimate Minecraft launcher with automatic mod management.$\r$\n$\r$\nClick Next to continue."
!endif

!ifndef MUI_FINISHPAGE_TITLE
  !define MUI_FINISHPAGE_TITLE "Installation Complete!"
!endif

!ifndef MUI_FINISHPAGE_TEXT
  !define MUI_FINISHPAGE_TEXT "LauncherChef has been installed successfully.$\r$\n$\r$\nClick Finish to close the wizard."
!endif

; ============================================================
;  CUSTOM MACROS
; ============================================================
!macro customInit
  SetCtlColors $HWNDPARENT 0x00FF41 0x0D0D0D
!macroend
