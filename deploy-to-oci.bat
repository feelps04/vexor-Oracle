@echo off
echo ============================================================
echo   VEXOR - Deploy para Oracle Cloud Infrastructure
echo ============================================================

set PUBLIC_IP=168.138.140.213
set SSH_KEY=%USERPROFILE%\.oci\private_key.pem

echo Public IP: %PUBLIC_IP%
echo SSH Key: %SSH_KEY%
echo.

:: Upload project using scp
echo [1/3] Upload do projeto...
scp -i %SSH_KEY% -o StrictHostKeyChecking=no -r C:\Users\Bete\Desktop\projeto-sentinel\packages opc@%PUBLIC_IP%:/home/opc/vexor/
scp -i %SSH_KEY% -o StrictHostKeyChecking=no C:\Users\Bete\Desktop\projeto-sentinel\package.json opc@%PUBLIC_IP%:/home/opc/vexor/
scp -i %SSH_KEY% -o StrictHostKeyChecking=no C:\Users\Bete\Desktop\projeto-sentinel\tsconfig.base.json opc@%PUBLIC_IP%:/home/opc/vexor/
scp -i %SSH_KEY% -o StrictHostKeyChecking=no C:\Users\Bete\Desktop\projeto-sentinel\.env opc@%PUBLIC_IP%:/home/opc/vexor/
scp -i %SSH_KEY% -o StrictHostKeyChecking=no C:\Users\Bete\Desktop\projeto-sentinel\deploy-remote.sh opc@%PUBLIC_IP%:/home/opc/vexor/

echo [2/3] Upload do script de deploy...
scp -i %SSH_KEY% -o StrictHostKeyChecking=no C:\Users\Bete\Desktop\projeto-sentinel\deploy-remote.sh opc@%PUBLIC_IP%:/home/opc/

echo [3/3] Executando deploy remoto...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no opc@%PUBLIC_IP% "chmod +x /home/opc/deploy-remote.sh && sudo /home/opc/deploy-remote.sh"

echo.
echo ============================================================
echo   Deploy concluido!
echo ============================================================
echo   URL Publica: http://%PUBLIC_IP%
echo   API: http://%PUBLIC_IP%:3000
echo   Social: http://%PUBLIC_IP%/social
echo ============================================================
pause
