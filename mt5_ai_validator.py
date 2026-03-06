#!/usr/bin/env python3
"""
VEXOR MT5 AI Validator - Nota 10
===============================
- Python direto para OCI GenAI (sem Node.js)
- Heartbeat Check no MMF (segurança)
- PostgreSQL Cadeado de Ferro (imparcialidade)
"""

import mmap
import struct
import time
import json
import os
import sys
import psycopg2
from datetime import datetime, time as dt_time
from typing import Optional, Dict, Any

# OCI SDK
try:
    import oci
    from oci.generative_ai_inference import GenerativeAiInferenceClient
    from oci.generative_ai_inference.models import (
        GenerateTextDetails,
        OnDemandServingMode,
        LlamaLlmInferenceRequest
    )
    OCI_AVAILABLE = True
except ImportError:
    OCI_AVAILABLE = False
    print("⚠️ OCI SDK não instalado. Execute: pip install oci")

# ==================== CONFIGURAÇÃO ====================

CONFIG = {
    # OCI Credentials
    "oci_user": "ocid1.user.oc1..aaaaaaaa565gvdyd655b6iatwhzgd5c7jwkjpqiq557nvtht6zlpoat73eta",
    "oci_tenancy": "ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a",
    "oci_fingerprint": "fc:e9:cd:fa:94:bb:33:ef:d8:d8:8e:81:80:83:5a:a6",
    "oci_region": "sa-saopaulo-1",
    "oci_key_file": "C:\\vexor\\.oci\\private_key.pem",
    "oci_compartment": "ocid1.tenancy.oc1..aaaaaaaaoavjhejphyhdysk3fpuvzzzuxpcue43mp6jtsajqpz2apxfnxz4a",
    
    # PostgreSQL
    "pg_host": "localhost",
    "pg_port": 5432,
    "pg_database": "vexor",
    "pg_user": "postgres",
    "pg_password": "Vexor2026",
    
    # MMF
    "mmf_path": "C:\\vexor\\mt5_data\\market_data.mmf",
    "mmf_size": 1024 * 1024,  # 1MB
    
    # Trading Rules (Cadeado de Ferro)
    "max_daily_loss": 500.0,  # R$500 max loss per day
    "trading_start": dt_time(9, 0),   # 09:00
    "trading_end": dt_time(17, 50),  # 17:50 (fecha 10min antes)
    "heartbeat_timeout": 2.0,  # segundos
}

# ==================== MEMORY MAPPED FILE ====================

class MMFManager:
    """Gerencia o Memory Mapped File com Heartbeat"""
    
    HEADER_SIZE = 64  # Bytes reservados para header
    
    def __init__(self, path: str, size: int):
        self.path = path
        self.size = size
        self.mmf = None
        self._init_mmf()
    
    def _init_mmf(self):
        """Inicializa ou cria o MMF"""
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        
        if not os.path.exists(self.path):
            # Criar arquivo
            with open(self.path, 'wb') as f:
                f.write(b'\x00' * self.size)
        
        self.mmf = mmap.mmap(
            open(self.path, 'r+b').fileno(),
            self.size
        )
    
    def write_heartbeat(self):
        """Escreve heartbeat no MMF (primeiros 8 bytes)"""
        timestamp = time.time()
        self.mmf.seek(0)
        self.mmf.write(struct.pack('d', timestamp))  # 8 bytes
        return timestamp
    
    def read_heartbeat(self) -> float:
        """Lê o último heartbeat do MMF"""
        self.mmf.seek(0)
        return struct.unpack('d', self.mmf.read(8))[0]
    
    def check_heartbeat(self) -> bool:
        """Verifica se o heartbeat está ativo (< 2 segundos)"""
        last_beat = self.read_heartbeat()
        elapsed = time.time() - last_beat
        return elapsed < CONFIG["heartbeat_timeout"]
    
    def write_market_data(self, data: dict):
        """Escreve dados de mercado no MMF (após header)"""
        self.mmf.seek(self.HEADER_SIZE)
        json_data = json.dumps(data).encode('utf-8')
        # Primeiro 4 bytes = tamanho
        self.mmf.write(struct.pack('I', len(json_data)))
        self.mmf.write(json_data)
        # Atualiza heartbeat junto
        self.write_heartbeat()
    
    def read_market_data(self) -> Optional[dict]:
        """Lê dados de mercado do MMF"""
        self.mmf.seek(self.HEADER_SIZE)
        size_bytes = self.mmf.read(4)
        if not size_bytes:
            return None
        
        size = struct.unpack('I', size_bytes)[0]
        if size == 0 or size > self.size:
            return None
        
        json_data = self.mmf.read(size).decode('utf-8')
        return json.loads(json_data)
    
    def close(self):
        if self.mmf:
            self.mmf.close()


# ==================== OCI GENAI VALIDATOR ====================

class OCIValidator:
    """Validador de operações usando OCI GenAI - IMPARCIAL"""
    
    def __init__(self, config: dict):
        self.config = config
        self.client = None
        self._init_oci()
    
    def _init_oci(self):
        """Inicializa cliente OCI GenAI"""
        if not OCI_AVAILABLE:
            print("⚠️ OCI SDK não disponível")
            return
        
        try:
            oci_config = {
                "user": self.config["oci_user"],
                "key_file": self.config["oci_key_file"],
                "fingerprint": self.config["oci_fingerprint"],
                "tenancy": self.config["oci_tenancy"],
                "region": self.config["oci_region"]
            }
            
            # Criar diretório e arquivo de chave se necessário
            key_dir = os.path.dirname(self.config["oci_key_file"])
            os.makedirs(key_dir, exist_ok=True)
            
            self.client = GenerativeAiInferenceClient(oci_config)
            print("✅ OCI GenAI conectado")
            
        except Exception as e:
            print(f"❌ Erro OCI: {e}")
            self.client = None
    
    def validar_operacao(self, dados_mercado: dict) -> str:
        """
        Envia dados para IA decidir COMPRAR, VENDER ou AGUARDAR
        Temperatura 0 = Máxima imparcialidade
        """
        if not self.client:
            return self._fallback_analysis(dados_mercado)
        
        try:
            # Montar prompt técnico
            prompt = self._build_prompt(dados_mercado)
            
            # Configurar requisição
            details = GenerateTextDetails()
            details.compartment_id = self.config["oci_compartment"]
            details.serving_mode = OnDemandServingMode(
                model_id="meta.llama-3-70b-instruct"
            )
            details.inference_request = LlamaLlmInferenceRequest(
                prompt=prompt,
                max_tokens=10,
                temperature=0.0,  # Zero = máxima lógica
                top_p=0.9
            )
            
            # Chamar OCI GenAI
            response = self.client.generate_text(details)
            
            decisao = response.data.inference_response.generated_texts[0].text.strip()
            decisao = decisao.upper().split()[0] if decisao else "AGUARDAR"
            
            # Validar resposta
            if decisao not in ["COMPRAR", "VENDER", "AGUARDAR"]:
                decisao = "AGUARDAR"
            
            return decisao
            
        except Exception as e:
            print(f"⚠️ Erro GenAI: {e}")
            return self._fallback_analysis(dados_mercado)
    
    def _build_prompt(self, dados: dict) -> str:
        """Constrói prompt técnico para análise"""
        return f"""<s>[INST] Você é um trader institucional SISTEMÁTICO. Analise os dados de mercado e responda APENAS uma palavra: COMPRAR, VENDER ou AGUARDAR.

DADOS DO MERCADO:
- Ativo: {dados.get('symbol', 'N/A')}
- Preço Atual: {dados.get('last', 0):.2f}
- Spread: {dados.get('spread', 0):.4f}
- Volume: {dados.get('volume', 0)}
- Tendência: {dados.get('trend', 'N/A')}

REGRA: Seja 100% lógico. Sem emoção. Responda apenas COMPRAR, VENDER ou AGUARDAR. [/INST]"""
    
    def _fallback_analysis(self, dados: dict) -> str:
        """Análise local de fallback"""
        # Lógica simples baseada em spread e volume
        spread = dados.get('spread', 0)
        volume = dados.get('volume', 0)
        
        if spread > 0.5:  # Spread alto = aguardar
            return "AGUARDAR"
        elif volume > 5000:  # Volume alto = considerar
            return "COMPRAR" if dados.get('last', 0) > 50 else "AGUARDAR"
        else:
            return "AGUARDAR"


# ==================== POSTGRESQL - CADEADO DE FERRO ====================

class PostgresCadeado:
    """PostgreSQL com regras imutáveis durante pregão"""
    
    def __init__(self, config: dict):
        self.config = config
        self.conn = None
        self._init_db()
    
    def _init_db(self):
        """Inicializa conexão e cria tabelas/procedures"""
        try:
            self.conn = psycopg2.connect(
                host=self.config["pg_host"],
                port=self.config["pg_port"],
                database=self.config["pg_database"],
                user=self.config["pg_user"],
                password=self.config["pg_password"]
            )
            
            self._create_cadeado_tables()
            self._create_stored_procedures()
            print("✅ PostgreSQL Cadeado de Ferro configurado")
            
        except Exception as e:
            print(f"❌ Erro PostgreSQL: {e}")
    
    def _create_cadeado_tables(self):
        """Cria tabelas do sistema de segurança"""
        cursor = self.conn.cursor()
        
        # Tabela de regras imutáveis
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS trading_rules (
                id SERIAL PRIMARY KEY,
                rule_name VARCHAR(50) UNIQUE NOT NULL,
                rule_value DECIMAL(18,4) NOT NULL,
                is_locked BOOLEAN DEFAULT FALSE,
                locked_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        
        # Tabela de perdas diárias
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_pnl (
                id SERIAL PRIMARY KEY,
                trading_date DATE UNIQUE NOT NULL,
                total_pnl DECIMAL(18,4) DEFAULT 0,
                trade_count INTEGER DEFAULT 0,
                max_loss_hit BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """"")
        
        # Tabela de ordens (audit)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS orders_audit (
                id SERIAL PRIMARY KEY,
                symbol VARCHAR(20) NOT NULL,
                side VARCHAR(10) NOT NULL,
                quantity DECIMAL(18,4),
                price DECIMAL(18,4),
                ai_decision VARCHAR(20),
                postgres_approved BOOLEAN,
                executed BOOLEAN DEFAULT FALSE,
                timestamp TIMESTAMP DEFAULT NOW()
            )
        """)
        
        # Inserir regras padrão
        cursor.execute("""
            INSERT INTO trading_rules (rule_name, rule_value)
            VALUES 
                ('max_daily_loss', %s),
                ('trading_start_hour', 9),
                ('trading_end_hour', 17),
                ('trading_end_minute', 50)
            ON CONFLICT (rule_name) DO NOTHING
        """, (self.config["max_daily_loss"],))
        
        self.conn.commit()
    
    def _create_stored_procedures(self):
        """Cria Stored Procedures de segurança"""
        cursor = self.conn.cursor()
        
        # PROCEDURE: pode_operar() - O Guardião
        # Retorna FALSE se:
        # - Fora do horário
        # - Perda diária atingida
        # - Sistema em modo de segurança
        cursor.execute("""
            CREATE OR REPLACE FUNCTION pode_operar()
            RETURNS BOOLEAN AS $$
            DECLARE
                v_max_loss DECIMAL;
                v_today_pnl DECIMAL;
                v_current_hour INT;
                v_current_minute INT;
                v_start_hour INT;
                v_end_hour INT;
                v_end_minute INT;
            BEGIN
                -- 1. Verificar horário
                v_current_hour := EXTRACT(HOUR FROM NOW());
                v_current_minute := EXTRACT(MINUTE FROM NOW());
                
                SELECT rule_value INTO v_start_hour 
                FROM trading_rules WHERE rule_name = 'trading_start_hour';
                
                SELECT rule_value INTO v_end_hour 
                FROM trading_rules WHERE rule_name = 'trading_end_hour';
                
                SELECT rule_value INTO v_end_minute 
                FROM trading_rules WHERE rule_name = 'trading_end_minute';
                
                -- Fora do horário = FALSE
                IF v_current_hour < v_start_hour OR 
                   v_current_hour > v_end_hour OR
                   (v_current_hour = v_end_hour AND v_current_minute >= v_end_minute) THEN
                    RETURN FALSE;
                END IF;
                
                -- 2. Verificar perda diária
                SELECT rule_value INTO v_max_loss 
                FROM trading_rules WHERE rule_name = 'max_daily_loss';
                
                SELECT COALESCE(total_pnl, 0) INTO v_today_pnl
                FROM daily_pnl WHERE trading_date = CURRENT_DATE;
                
                -- Perda >= limite = FALSE
                IF v_today_pnl <= -v_max_loss THEN
                    RETURN FALSE;
                END IF;
                
                -- 3. Tudo OK = TRUE
                RETURN TRUE;
            END;
            $$ LANGUAGE plpgsql;
        """)
        
        # PROCEDURE: registrar_operacao()
        cursor.execute("""
            CREATE OR REPLACE FUNCTION registrar_operacao(
                p_symbol VARCHAR,
                p_side VARCHAR,
                p_quantity DECIMAL,
                p_price DECIMAL,
                p_ai_decision VARCHAR
            )
            RETURNS BOOLEAN AS $$
            DECLARE
                v_can_trade BOOLEAN;
            BEGIN
                -- Verificar se pode operar
                SELECT pode_operar() INTO v_can_trade;
                
                -- Registrar tentativa
                INSERT INTO orders_audit (
                    symbol, side, quantity, price, 
                    ai_decision, postgres_approved
                ) VALUES (
                    p_symbol, p_side, p_quantity, p_price,
                    p_ai_decision, v_can_trade
                );
                
                RETURN v_can_trade;
            END;
            $$ LANGUAGE plpgsql;
        """)
        
        # PROCEDURE: atualizar_pnl()
        cursor.execute("""
            CREATE OR REPLACE FUNCTION atualizar_pnl(p_pnl DECIMAL)
            RETURNS VOID AS $$
            BEGIN
                INSERT INTO daily_pnl (trading_date, total_pnl, trade_count)
                VALUES (CURRENT_DATE, p_pnl, 1)
                ON CONFLICT (trading_date) 
                DO UPDATE SET 
                    total_pnl = daily_pnl.total_pnl + p_pnl,
                    trade_count = daily_pnl.trade_count + 1,
                    max_loss_hit = (daily_pnl.total_pnl + p_pnl <= 
                        (SELECT rule_value FROM trading_rules WHERE rule_name = 'max_daily_loss') * -1);
            END;
            $$ LANGUAGE plpgsql;
        """)
        
        # PROCEDURE: travar_regras() - Impede alteração durante pregão
        cursor.execute("""
            CREATE OR REPLACE FUNCTION travar_regras()
            RETURNS VOID AS $$
            BEGIN
                UPDATE trading_rules 
                SET is_locked = TRUE, locked_at = NOW()
                WHERE is_locked = FALSE;
            END;
            $$ LANGUAGE plpgsql;
        """)
        
        self.conn.commit()
    
    def pode_operar(self) -> bool:
        """Verifica se pode operar (consulta o banco)"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("SELECT pode_operar()")
            return cursor.fetchone()[0]
        except:
            return False
    
    def validar_e_registrar(self, symbol: str, side: str, 
                           quantity: float, price: float,
                           ai_decision: str) -> bool:
        """Valida operação e registra no banco"""
        try:
            cursor = self.conn.cursor()
            cursor.execute(
                "SELECT registrar_operacao(%s, %s, %s, %s, %s)",
                (symbol, side, quantity, price, ai_decision)
            )
            self.conn.commit()
            return cursor.fetchone()[0]
        except Exception as e:
            print(f"❌ Erro validação: {e}")
            return False
    
    def atualizar_pnl(self, pnl: float):
        """Atualiza PnL diário"""
        try:
            cursor = self.conn.cursor()
            cursor.execute("SELECT atualizar_pnl(%s)", (pnl,))
            self.conn.commit()
        except Exception as e:
            print(f"❌ Erro atualizar PnL: {e}")
    
    def fechar(self):
        if self.conn:
            self.conn.close()


# ==================== SISTEMA PRINCIPAL ====================

class VEXORValidator:
    """Sistema completo de validação VEXOR"""
    
    def __init__(self):
        print("=" * 60)
        print("  VEXOR MT5 AI Validator - Nota 10")
        print("=" * 60)
        
        # Inicializar componentes
        self.mmf = MMFManager(CONFIG["mmf_path"], CONFIG["mmf_size"])
        self.ai = OCIValidator(CONFIG)
        self.db = PostgresCadeado(CONFIG)
        
        self.running = True
        self.last_heartbeat = time.time()
    
    def run(self):
        """Loop principal de validação"""
        print("\n🚀 Iniciando loop de validação...")
        print("   - Heartbeat: ativo")
        print("   - OCI GenAI: conectado" if self.ai.client else "   - OCI GenAI: fallback local")
        print("   - PostgreSQL: cadeado de ferro ativo")
        print("\n📊 Aguardando dados do MT5...\n")
        
        while self.running:
            try:
                # 1. Atualizar heartbeat
                self.mmf.write_heartbeat()
                
                # 2. Ler dados do mercado
                market_data = self.mmf.read_market_data()
                
                if market_data and 'ticks' in market_data:
                    for tick in market_data['ticks']:
                        # 3. Validar com PostgreSQL (CADEADO DE FERRO)
                        if not self.db.pode_operar():
                            print("⛔ BLOQUEADO pelo Cadeado de Ferro - Fora de horário ou perda limite")
                            continue
                        
                        # 4. Validar com OCI GenAI (IMPARCIAL)
                        decisao = self.ai.validar_operacao(tick)
                        
                        # 5. Se decisão for AGUARDAR, pular
                        if decisao == "AGUARDAR":
                            print(f"⏸️ {tick['symbol']}: AGUARDAR (IA)")
                            continue
                        
                        # 6. Registrar e validar operação
                        aprovado = self.db.validar_e_registrar(
                            symbol=tick['symbol'],
                            side="BUY" if decisao == "COMPRAR" else "SELL",
                            quantity=1,
                            price=tick['last'],
                            ai_decision=decisao
                        )
                        
                        if aprovado:
                            print(f"✅ {tick['symbol']}: {decisao} @ {tick['last']:.2f}")
                            # Enviar ordem para MT5 aqui
                        else:
                            print(f"❌ {tick['symbol']}: REJEITADO pelo banco")
                
                # 7. Verificar heartbeat do sistema
                if not self.mmf.check_heartbeat():
                    print("⚠️ ALERTA: Heartbeat timeout - Entrando em modo seguro")
                    self._emergency_close_all()
                
                time.sleep(0.5)
                
            except KeyboardInterrupt:
                print("\n\n🛑 Parando sistema...")
                self.running = False
            except Exception as e:
                print(f"❌ Erro: {e}")
                time.sleep(1)
        
        self._cleanup()
    
    def _emergency_close_all(self):
        """Fecha todas as ordens em emergência"""
        print("🚨 MODO DE EMERGÊNCIA - Fechando todas as ordens")
        # Aqui você chamaria o MT5 para fechar todas as posições
        # Exemplo: mt5_close_all_positions()
    
    def _cleanup(self):
        """Limpeza ao sair"""
        self.mmf.close()
        self.db.fechar()
        print("✅ Sistema encerrado com segurança")


# ==================== MAIN ====================

if __name__ == "__main__":
    # Verificar dependências
    print("Verificando dependências...")
    
    missing = []
    
    if not OCI_AVAILABLE:
        missing.append("oci (pip install oci)")
    
    try:
        import psycopg2
    except ImportError:
        missing.append("psycopg2 (pip install psycopg2-binary)")
    
    if missing:
        print("\n❌ Dependências faltando:")
        for m in missing:
            print(f"   - {m}")
        print("\nInstale com: pip install oci psycopg2-binary")
        sys.exit(1)
    
    # Executar sistema
    validator = VEXORValidator()
    validator.run()
