@echo off
echo Conectando a VEXOR Windows Server...
echo IP: 132.226.166.206
echo Usuario: opc
echo Senha: L26112004Lf@
echo.
echo Conectando automaticamente...
echo.

:: Salva credenciais
cmdkey /generic:132.226.166.206 /user:opc /pass:"L26112004Lf@"

:: Abre RDP
start mstsc /v:132.226.166.206 /admin

echo RDP aberto!
pause
