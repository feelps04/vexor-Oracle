@echo off
echo Copiando arquivos do VEXOR para a VM...
echo.

:: Usa scp para copiar (precisa ter OpenSSH client)
scp -r C:\Users\Bete\Desktop\projeto-sentinel\packages\api\dist opc@132.226.166.206:C:/vexor/packages/api/
scp -r C:\Users\Bete\Desktop\projeto-sentinel\packages\web\dist opc@132.226.166.206:C:/vexor/packages/web/
scp C:\Users\Bete\Desktop\projeto-sentinel\packages\api\package.json opc@132.226.166.206:C:/vexor/packages/api/
scp C:\Users\Bete\Desktop\projeto-sentinel\.env opc@132.226.166.206:C:/vexor/

echo.
echo Arquivos copiados!
pause
