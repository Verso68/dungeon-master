"""
Extrae el texto de un PDF de D&D y lo guarda como texto plano.

Uso:
  python scripts/extract-pdf.py <ruta-al-pdf> <nombre-salida>

Ejemplos:
  python scripts/extract-pdf.py "La Mina Perdida de Phandelver.pdf" adventure
  python scripts/extract-pdf.py "Dungeon Masters Guide.pdf" dmg

El archivo se guardara en data/<nombre-salida>.txt
"""
import sys
import os

try:
    from PyPDF2 import PdfReader
except ImportError:
    print("Instalando PyPDF2...")
    os.system(f"{sys.executable} -m pip install PyPDF2")
    from PyPDF2 import PdfReader


def extract_pdf(pdf_path, output_path):
    reader = PdfReader(pdf_path)
    text = []

    for i, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if page_text:
            text.append(f"--- Pagina {i + 1} ---\n{page_text}")

    full_text = "\n\n".join(text)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(full_text)

    print(f"Extraidas {len(reader.pages)} paginas -> {output_path}")
    print(f"Tamano: {len(full_text):,} caracteres")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python scripts/extract-pdf.py <ruta-al-pdf> <nombre-salida>")
        print()
        print("Ejemplos:")
        print('  python scripts/extract-pdf.py "La Mina Perdida de Phandelver.pdf" adventure')
        print('  python scripts/extract-pdf.py "Dungeon Masters Guide.pdf" dmg')
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_name = sys.argv[2]

    if not os.path.exists(pdf_path):
        print(f"Error: No se encuentra el archivo '{pdf_path}'")
        sys.exit(1)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "..", "data", f"{output_name}.txt")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    extract_pdf(pdf_path, output_path)
