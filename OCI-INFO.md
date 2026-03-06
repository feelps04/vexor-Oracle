# VEXOR - Oracle Cloud Infrastructure Deployment

## 📋 Informações da Conta OCI

| Campo | Valor |
|-------|-------|
| **Tenancy OCID** | `ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a` |
| **User OCID** | `ocid1.user.oc1..aaaaaaaa565gvdyd655b6iatwhzgd5c7jwkjpqiq557nvtht6zlpoat73eta` |
| **Fingerprint** | `fc:e9:cd:fa:94:bb:33:ef:d8:d8:8e:81:80:83:5a:a6` |
| **Region** | `sa-saopaulo-1` (São Paulo, Brasil) |
| **Compartment ID** | `ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a` |

## 🖥️ Instância Windows (VEXOR Server)

| Campo | Valor |
|-------|-------|
| **Instance ID** | `ocid1.instance.oc1.sa-saopaulo-1.antxeljrskai3kqc7ln4vmfpwsc2l64ckq2pr27kplkqzkmdbp6uzf3zq32q` |
| **Display Name** | `vexor-server` |
| **Public IP** | `132.226.166.206` |
| **Private IP** | `10.0.1.164` |
| **Shape** | `VM.Standard.E5.Flex` |
| **vCPUs** | 4 (8 threads) |
| **Memory** | 16 GB |
| **OS** | Windows Server 2025 Standard |
| **Processor** | AMD EPYC™ 9J14 (Genoa) 2.3 GHz |

## 🔐 Credenciais de Acesso

### RDP (Remote Desktop)
- **IP:** `132.226.166.206`
- **Usuário:** `opc`
- **Senha:** `L26112004Lf@`
- **Porta:** 3389

### Conexão RDP via comando:
```
mstsc /v:132.226.166.206
```

## 🌐 URLs Públicas

| Serviço | URL |
|---------|-----|
| **Plataforma Web** | `http://132.226.166.206` |
| **API** | `http://132.226.166.206:3000` |
| **Health Check** | `http://132.226.166.206:3000/api/v1/health` |
| **Social Feed** | `http://132.226.166.206:3000/api/v1/social/feed` |

## 🔑 OCI Generative AI Keys

| Chave | Valor |
|-------|-------|
| **Primary Key** | `sk-k0e35cOHls3M8Wa10pFdmtRqSmvGN6ntZFrl9O56Y4EeyBko` |
| **Backup Key** | `sk-DKi0XyVcN2UR2yVzyVco2l4wyplL37rwOh4XZr4E9iMNFeZn` |

## 🗄️ Supabase (Database)

| Campo | Valor |
|-------|-------|
| **URL** | `https://tonwuegoyftfgfpkbvop.supabase.co` |
| **Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0ODA4ODEsImV4cCI6MjA4ODA1Njg4MX0.tsholJQFV_pKFajDsGHLUYnOD959TJSvXxYvNxs7pc8` |
| **Service Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnd1ZWdveWZ0ZmdmcGtidm9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ4MDg4MSwiZXhwIjoyMDg4MDU2ODgxfQ.9APp09YzrQoQNEVnhnfvNHgfM1dovMxP_ajEol0GzbA` |
| **Database URL** | `postgresql://postgres:G0Qg5TKjabVxnicn@db.tonwuegoyftfgfpkbvop.supabase.co:5432/postgres` |

## 📡 Network Configuration

### VCN (Virtual Cloud Network)
- **VCN ID:** `ocid1.vcn.oc1.sa-saopaulo-1.amaaaaaaskai3kqarzyf7d6vkqhrnha5vsbl3gk5npzkjmowjfam4geck7wq`
- **CIDR:** `10.0.0.0/16`
- **Name:** `dashboard-vcn`

### Subnet
- **Subnet ID:** `ocid1.subnet.oc1.sa-saopaulo-1.aaaaaaaa5ms6zz3xcazcozd3vzhylla7fswggnd2mk26jp336gtn4baskkrq`
- **CIDR:** `10.0.1.0/24`
- **Name:** `dashboard-subnet`

### Security List (Firewall Rules)
- **Security List ID:** `ocid1.securitylist.oc1.sa-saopaulo-1.aaaaaaaaswbpqpkbv2a4t2565wy747h6fhds3dorhjbm7mgbe7omoofrz5ka`

#### Portas Abertas (Inbound)
| Porta | Protocolo | Descrição |
|-------|-----------|-----------|
| 22 | TCP | SSH |
| 80 | TCP | HTTP |
| 443 | TCP | HTTPS |
| 3000 | TCP | VEXOR API |
| 3389 | TCP | RDP |
| 5174 | TCP | Vite Dev Server |

## 📦 Software Instalado na VM

| Software | Versão |
|----------|--------|
| Windows Server | 2025 Standard |
| Node.js | v20.11.0 |
| npm | 10.2.4 |
| PM2 | Latest |
| MetaTrader 5 | Genial + Pepperstone |

## 🚀 Comandos Úteis

### OCI CLI - Gerenciar Instância
```bash
# Listar instâncias
oci compute instance list --compartment-id ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a

# Iniciar instância
oci compute instance-action --action START --instance-id ocid1.instance.oc1.sa-saopaulo-1.antxeljrskai3kqc7ln4vmfpwsc2l64ckq2pr27kplkqzkmdbp6uzf3zq32q

# Parar instância
oci compute instance-action --action STOP --instance-id ocid1.instance.oc1.sa-saopaulo-1.antxeljrskai3kqc7ln4vmfpwsc2l64ckq2pr27kplkqzkmdbp6uzf3zq32q

# Obter IP público
oci network vnic get --vnic-id ocid1.vnic.oc1.sa-saopaulo-1.abtxeljrkt7ht5d6uj4pioo3gg4dv5veyt2ieabhiuwoqygqwdjsjyrknukq
```

### PM2 - Gerenciar Processos (na VM)
```powershell
# Ver status
pm2 status

# Ver logs
pm2 logs

# Reiniciar
pm2 restart vexor-platform

# Parar
pm2 stop vexor-platform

# Salvar configuração
pm2 save
```

## 📁 Estrutura do Projeto na VM

```
C:\vexor\
├── .env                          # Variáveis de ambiente
├── ecosystem.config.js           # Configuração PM2
├── package.json                  # Dependências raiz
└── packages\
    ├── api\
    │   ├── app.js                # API Fastify
    │   ├── package.json
    │   └── node_modules\
    └── web\
        └── dist\
            └── index.html        # Frontend
```

## 📝 Variáveis de Ambiente (.env)

```env
TWELVE_DATA_API_KEY=f908c32743af495fbd29ac1d946446de
SUPABASE_URL=https://tonwuegoyftfgfpkbvop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DATABASE_URL=postgresql://postgres:***@db.tonwuegoyftfgfpkbvop.supabase.co:5432/postgres
OCI_USER_OCID=ocid1.user.oc1..aaaaaaaa565gvdyd655b6iatwhzgd5c7jwkjpqiq557nvtht6zlpoat73eta
OCI_TENANCY_OCID=ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a
OCI_FINGERPRINT=fc:e9:cd:fa:94:bb:33:ef:d8:d8:8e:81:80:83:5a:a6
OCI_REGION=sa-saopaulo-1
OCI_GENAI_PRIMARY_KEY=sk-k0e35cOHls3M8Wa10pFdmtRqSmvGN6ntZFrl9O56Y4EeyBko
OCI_GENAI_BACKUP_KEY=sk-DKi0XyVcN2UR2yVzyVco2l4wyplL37rwOh4XZr4E9iMNFeZn
NODE_ENV=production
PORT=3000
```

## 🔧 Troubleshooting

### RDP não conecta
1. Verifique se a instância está rodando: `oci compute instance list`
2. Verifique se a porta 3389 está aberta no security list
3. Execute na VM: `Enable-NetFirewallRule -DisplayGroup "Remote Desktop"`

### API não responde
1. Verifique se o PM2 está rodando: `pm2 status`
2. Verifique os logs: `pm2 logs vexor-platform`
3. Reinicie: `pm2 restart vexor-platform`

### Instância parada
```bash
oci compute instance-action --action START --instance-id ocid1.instance.oc1.sa-saopaulo-1.antxeljrskai3kqc7ln4vmfpwsc2l64ckq2pr27kplkqzkmdbp6uzf3zq32q
```

## 📞 Suporte

- **OCI Console:** https://cloud.oracle.com
- **Region:** sa-saopaulo-1
- **Compartment:** root (tenancy)

---
*Documentação gerada automaticamente pelo VEXOR Deployment System*
*Última atualização: 2026-03-06*
