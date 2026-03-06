import csv

# Ler CSV e corrigir ENER3 para ENBR3
input_file = 'C:\\Users\\Bete\\Desktop\\projeto-sentinel\\sectors_symbols.csv'
output_file = 'C:\\Users\\Bete\\Desktop\\projeto-sentinel\\sectors_symbols_fixed.csv'

with open(input_file, 'r', encoding='utf-8') as f_in, \
     open(output_file, 'w', encoding='utf-8', newline='') as f_out:
    
    reader = csv.reader(f_in)
    writer = csv.writer(f_out)
    
    # Escreve header
    header = next(reader)
    writer.writerow(header)
    
    changes = 0
    for row in reader:
        if len(row) >= 4:
            # Corrigir ENER3 para ENBR3
            if row[3] == 'ENER3':
                row[3] = 'ENBR3'
                changes += 1
                print(f"Corrigido: ENER3 -> ENBR3 ({row[0]} - {row[1]})")
        
        writer.writerow(row)
    
    print(f"\nTotal de correções: {changes}")
    print(f"Arquivo salvo: {output_file}")
