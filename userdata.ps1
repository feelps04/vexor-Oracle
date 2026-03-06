<powershell>
# Configurar senha do usuario opc
net user opc L26112004Lf@

# Habilitar RDP
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 0
Enable-NetFirewallRule -DisplayGroup "Remote Desktop"

# Renomear computador
Rename-Computer -NewName "VEXOR-SERVER" -Force

# Reiniciar para aplicar
Restart-Computer -Force
</powershell>
