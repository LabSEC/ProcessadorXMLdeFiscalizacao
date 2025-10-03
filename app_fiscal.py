import os
import io
import zipfile
from typing import List, Tuple, Dict
from flask import Flask, request, jsonify, send_file
from lxml import etree
import pandas as pd
import requests

APP_ROOT = "/APP/moodle/fiscalizacao"
XSD_DIR = os.path.join(APP_ROOT, "xsd")
FISCAL_XSD = os.path.join(XSD_DIR, "arquivofiscalizacao_v1-05.xsd")
DIPLOMA_XSD = os.path.join(XSD_DIR, "diplomadigital_v1-05.xsd")

def load_schema(xsd_path: str) -> etree.XMLSchema:
    original_dir = os.getcwd()
    try:
        xsd_dir = os.path.dirname(os.path.abspath(xsd_path))
        os.chdir(xsd_dir)
        parser = etree.XMLParser(resolve_entities=False, no_network=False, load_dtd=False)
        doc = etree.parse(xsd_path, parser=parser)
        schema = etree.XMLSchema(doc)
        return schema
    finally:
        os.chdir(original_dir)

SCHEMA_FISCAL = load_schema(FISCAL_XSD)
SCHEMA_DIPLOMA = load_schema(DIPLOMA_XSD)

app = Flask(__name__)

def parse_xml_bytes(data: bytes) -> etree._Element:
    if isinstance(data, str):
        data = data.encode('utf-8')
    
    parser = etree.XMLParser(
        resolve_entities=False,
        no_network=False,
        load_dtd=False,
        huge_tree=True,
        encoding='utf-8',
        recover=False,
        remove_blank_text=False
    )
    
    return etree.fromstring(data, parser=parser)

def validate_tree(tree: etree._Element, schema: etree.XMLSchema) -> Tuple[bool, List[str]]:
    try:
        ok = schema.validate(tree)
        if ok:
            return True, []
        errs = [str(e) for e in schema.error_log]
        return False, errs
    except Exception as e:
        return False, [f"ValidationRuntimeError: {type(e).__name__}: {e}"]

def detect_fiscal_tipo(root: etree._Element) -> str:
    namespaces = {'mec': 'http://portal.mec.gov.br/diplomadigital/arquivos-em-xsd'}
    
    if root.find('.//mec:infArquivoFiscalizacaoRegistradora', namespaces=namespaces) is not None:
        return "registradora"
    if root.find('.//mec:infArquivoFiscalizacaoEmissora', namespaces=namespaces) is not None:
        return "emissora"
    return "desconhecido"

def extract_ies_info(root: etree._Element, tipo: str) -> Dict:
    namespaces = {'mec': 'http://portal.mec.gov.br/diplomadigital/arquivos-em-xsd'}
    
    ies_elem = None
    if tipo == "emissora":
        ies_elem = root.find('.//mec:IESEmissora', namespaces=namespaces)
    elif tipo == "registradora":
        ies_elem = root.find('.//mec:IESRegistradora', namespaces=namespaces)
    
    if ies_elem is None:
        return {}
    
    def get_text(xpath):
        el = ies_elem.find(xpath, namespaces=namespaces)
        return el.text.strip() if el is not None and el.text else ""
    
    return {
        "Nome": get_text('mec:Nome'),
        "CodigoMEC": get_text('mec:CodigoMEC'),
        "CNPJ": get_text('mec:CNPJ'),
        "Logradouro": get_text('mec:Endereco/mec:Logradouro'),
        "Numero": get_text('mec:Endereco/mec:Numero'),
        "Bairro": get_text('mec:Endereco/mec:Bairro'),
        "Municipio": get_text('mec:Endereco/mec:NomeMunicipio'),
        "UF": get_text('mec:Endereco/mec:UF'),
        "CEP": get_text('mec:Endereco/mec:CEP')
    }

def extract_fiscalizacao_dates(root: etree._Element) -> Dict:
    namespaces = {'mec': 'http://portal.mec.gov.br/diplomadigital/arquivos-em-xsd'}
    
    def get_text(xpath):
        el = root.find(xpath, namespaces=namespaces)
        return el.text.strip() if el is not None and el.text else ""
    
    return {
        "DataInicioFiscalizacao": get_text('.//mec:DataInicioFiscalizacao'),
        "DataFimFiscalizacao": get_text('.//mec:DataFimFiscalizacao')
    }

def find_urls_diplomado(root: etree._Element) -> List[str]:
    namespaces = {'mec': 'http://portal.mec.gov.br/diplomadigital/arquivos-em-xsd'}
    urls = []
    
    for el in root.findall('.//mec:URLXMLdoDiplomado', namespaces=namespaces):
        if el.text and el.text.strip().lower().startswith(("http://", "https://")):
            urls.append(el.text.strip())
    
    return urls

def http_get_xml(url: str, timeout=15) -> bytes:
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content

def extract_all_diploma_fields(root: etree._Element) -> Dict[str, str]:
    namespaces = {'mec': 'http://portal.mec.gov.br/diplomadigital/arquivos-em-xsd'}
    
    def get_text(xpath):
        el = root.find(xpath, namespaces=namespaces)
        return el.text.strip() if el is not None and el.text else ""
    
    return {
        "Nome": get_text('.//mec:Diplomado/mec:Nome'),
        "NomeSocial": get_text('.//mec:Diplomado/mec:NomeSocial'),
        "CPF": get_text('.//mec:Diplomado/mec:CPF'),
        "Sexo": get_text('.//mec:Diplomado/mec:Sexo'),
        "DataNascimento": get_text('.//mec:Diplomado/mec:DataNascimento'),
        "Nacionalidade": get_text('.//mec:Diplomado/mec:Nacionalidade'),
        "NaturalMunicipio": get_text('.//mec:Diplomado/mec:Naturalidade/mec:NomeMunicipio'),
        "NaturalUF": get_text('.//mec:Diplomado/mec:Naturalidade/mec:UF'),
        "NomeCurso": get_text('.//mec:DadosCurso/mec:NomeCurso'),
        "CodigoEMECCurso": get_text('.//mec:DadosCurso/mec:CodigoEMECCurso'),
        "GrauConferido": get_text('.//mec:DadosCurso/mec:GrauConferido'),
        "TituloConferido": get_text('.//mec:DadosCurso/mec:TituloConferido/mec:Titulo'),
        "Modalidade": get_text('.//mec:DadosCurso/mec:Modalidade'),
        "Habilitacao": get_text('.//mec:DadosCurso/mec:Habilitacao'),
        "CodigoDiploma": get_text('.//mec:DadosDiploma/mec:CodigoDiploma'),
        "DataExpedicao": get_text('.//mec:DadosDiploma/mec:DataExpedicao'),
        "DataColacaoGrau": get_text('.//mec:DadosDiploma/mec:DataColacaoGrau'),
        "DataRegistro": get_text('.//mec:DadosRegistro/mec:DataRegistroDiploma'),
        "LivroRegistro": get_text('.//mec:DadosRegistro/mec:LivroRegistro'),
        "FolhaRegistro": get_text('.//mec:DadosRegistro/mec:FolhaRegistro'),
        "NumeroRegistro": get_text('.//mec:DadosRegistro/mec:NumeroRegistro')
    }

def extract_dados_registradora(root: etree._Element) -> List[Dict[str, str]]:
    namespaces = {'mec': 'http://portal.mec.gov.br/diplomadigital/arquivos-em-xsd'}
    diplomas = []

    for diploma in root.findall('.//mec:DiplomaFiscalizado', namespaces=namespaces):
        def get_text(elem_name):
            el = diploma.find(f'mec:{elem_name}', namespaces=namespaces)
            return el.text.strip() if el is not None and el.text else ""

        def get_text_nested(path):
            el = diploma.find(path, namespaces=namespaces)
            return el.text.strip() if el is not None and el.text else ""

        diplomas.append({
            "CodigoDiploma": get_text("CodigoDiploma"),
            "CPFDetentor": get_text("CPFDetentor"),
            "CodigoEMECEmissora": get_text("CodigoEMECEmissora"),
            "CodigoEMECCurso": get_text("CodigoEMECCurso"),
            "LivroRegistro": get_text_nested('mec:DadosRegistro/mec:LivroRegistro'),
            "NumeroRegistro": get_text_nested('mec:DadosRegistro/mec:NumeroRegistro'),
            "FolhaRegistro": get_text_nested('mec:DadosRegistro/mec:FolhaRegistro'),
            "DataColacaoGrau": get_text_nested('mec:DadosRegistro/mec:DataColacaoGrau'),
            "DataExpedicaoDiploma": get_text_nested('mec:DadosRegistro/mec:DataExpedicaoDiploma'),
            "DataRegistroDiploma": get_text_nested('mec:DadosRegistro/mec:DataRegistroDiploma'),
            "ResponsavelRegistroNome": get_text_nested('mec:DadosRegistro/mec:ResponsavelRegistro/mec:Nome'),
            "ResponsavelRegistroCPF": get_text_nested('mec:DadosRegistro/mec:ResponsavelRegistro/mec:CPF'),
            "IdDocumentacaoAcademica": get_text("IdDocumentacaoAcademica")
        })

    return diplomas

@app.route("/api/healthz")
def healthz():
    return jsonify({"status": "ok", "schemas": {"fiscal": FISCAL_XSD, "diploma": DIPLOMA_XSD}})

def process_single_file(filename: str, file_data: bytes, expected_tipo: str = None):
    """Processa um único arquivo XML"""
    try:
        tree = parse_xml_bytes(file_data)
    except Exception as parse_ex:
        return {
            "filename": filename,
            "tipo": "desconhecido",
            "ies_info": {},
            "dates_info": {},
            "diplomas": [],
            "report": {
                "ok": False,
                "tipo": "desconhecido",
                "errors": [f"Erro ao fazer parse do XML: {type(parse_ex).__name__}: {str(parse_ex)}"],
                "validation_errors": [],
                "fetch_errors": [],
                "wrong_type": False
            }
        }
    
    try:
        tipo = detect_fiscal_tipo(tree)
        
        # Verificar se o tipo está correto
        wrong_type = False
        if expected_tipo and tipo != expected_tipo and tipo != "desconhecido":
            wrong_type = True
        
        ok, errs = validate_tree(tree, SCHEMA_FISCAL)

        file_report = {
            "ok": ok and not wrong_type,
            "tipo": tipo,
            "errors": errs,
            "validation_errors": [],
            "fetch_errors": [],
            "wrong_type": wrong_type
        }
        
        if wrong_type:
            file_report["errors"].append(f"Tipo de arquivo incorreto: esperado '{expected_tipo}', encontrado '{tipo}'")

        file_result = {
            "filename": filename,
            "tipo": tipo,
            "ies_info": {},
            "dates_info": {},
            "diplomas": [],
            "report": file_report
        }

        if not ok or wrong_type:
            return file_result

        ies_info = extract_ies_info(tree, tipo)
        dates_info = extract_fiscalizacao_dates(tree)
        
        file_result["ies_info"] = ies_info
        file_result["dates_info"] = dates_info

        if tipo == "emissora":
            urls = find_urls_diplomado(tree)
            
            for url in urls:
                try:
                    xml_dip = http_get_xml(url, timeout=20)
                    dip_root = parse_xml_bytes(xml_dip)
                    _ok_d, _errs_d = validate_tree(dip_root, SCHEMA_DIPLOMA)
                    
                    if not _ok_d:
                        file_report["validation_errors"].append({
                            "url": url,
                            "errors": _errs_d
                        })
                        diploma_data = extract_all_diploma_fields(dip_root)
                        diploma_data["_validation_status"] = "invalid"
                        diploma_data["_validation_errors"] = _errs_d
                        file_result["diplomas"].append(diploma_data)
                    else:
                        diploma_data = extract_all_diploma_fields(dip_root)
                        diploma_data["_validation_status"] = "valid"
                        file_result["diplomas"].append(diploma_data)
                        
                except Exception as ex:
                    file_report["fetch_errors"].append({
                        "url": url,
                        "error": f"{type(ex).__name__}: {ex}"
                    })

        elif tipo == "registradora":
            file_result["diplomas"] = extract_dados_registradora(tree)

        return file_result

    except Exception as ex:
        import traceback
        return {
            "filename": filename,
            "tipo": "desconhecido",
            "ies_info": {},
            "dates_info": {},
            "diplomas": [],
            "report": {
                "ok": False,
                "tipo": "desconhecido",
                "errors": [f"Unhandled: {type(ex).__name__}: {ex}"],
                "traceback": traceback.format_exc(),
                "wrong_type": False
            }
        }

@app.route("/api/process-files", methods=["POST"])
def process_files():
    if "files" not in request.files:
        return jsonify({"error": "Envie arquivos"}), 400

    files = request.files.getlist("files")
    expected_tipo = request.form.get("tipo", None)
    all_results = []

    for f in files:
        data = f.read()
        result = process_single_file(f.filename, data, expected_tipo)
        all_results.append(result)

    return jsonify({
        "files": all_results,
        "available_fields": get_available_fields()
    })

@app.route("/api/process-zip", methods=["POST"])
def process_zip():
    if "file" not in request.files:
        return jsonify({"error": "Envie arquivo ZIP"}), 400

    zip_file = request.files["file"]
    expected_tipo = request.form.get("tipo", None)

    if not zip_file.filename.endswith('.zip'):
        return jsonify({"error": "Arquivo deve ser .zip"}), 400

    all_results = []

    try:
        zip_data = io.BytesIO(zip_file.read())

        with zipfile.ZipFile(zip_data, 'r') as zf:
            xml_files = [name for name in zf.namelist() 
                        if name.lower().endswith('.xml') and not name.startswith('__MACOSX')]

            if not xml_files:
                return jsonify({"error": "Nenhum arquivo XML encontrado no ZIP"}), 400

            for xml_filename in xml_files:
                data = zf.read(xml_filename)
                result = process_single_file(xml_filename, data, expected_tipo)
                all_results.append(result)

        return jsonify({
            "files": all_results,
            "available_fields": get_available_fields()
        })

    except zipfile.BadZipFile:
        return jsonify({"error": "Arquivo ZIP inválido ou corrompido"}), 400
    except Exception as e:
        import traceback
        return jsonify({"error": f"Erro ao processar ZIP: {type(e).__name__}: {e}", "traceback": traceback.format_exc()}), 500

@app.route("/api/export-csv", methods=["POST"])
def export_csv():
    payload = request.get_json()
    
    selected_files = payload.get("selected_files", [])
    selected_fields = payload.get("fields", [])
    all_files_data = payload.get("files_data", [])
    
    rows_with_ies = []
    
    for file_data in all_files_data:
        if file_data["filename"] not in selected_files:
            continue
            
        ies_info = file_data.get("ies_info", {})
        dates_info = file_data.get("dates_info", {})
        
        for diploma in file_data.get("diplomas", []):
            combined = {**ies_info, **dates_info, **diploma}
            rows_with_ies.append(combined)
    
    if rows_with_ies:
        df = pd.DataFrame(rows_with_ies)
        # Filtrar apenas as colunas selecionadas
        available_cols = [col for col in selected_fields if col in df.columns]
        df = df[available_cols]
    else:
        df = pd.DataFrame()

    csv_buf = io.StringIO()
    df.to_csv(csv_buf, index=False)
    csv_bytes = csv_buf.getvalue().encode("utf-8-sig")

    return send_file(
        io.BytesIO(csv_bytes),
        mimetype="text/csv",
        as_attachment=True,
        download_name="fiscalizacao_export.csv"
    )

def get_available_fields():
    return {
        "emissora": [
            {"id": "Nome", "label": "Nome do Diplomado"},
            {"id": "NomeSocial", "label": "Nome Social"},
            {"id": "CPF", "label": "CPF"},
            {"id": "Sexo", "label": "Sexo"},
            {"id": "DataNascimento", "label": "Data de Nascimento"},
            {"id": "Nacionalidade", "label": "Nacionalidade"},
            {"id": "NaturalMunicipio", "label": "Município de Nascimento"},
            {"id": "NaturalUF", "label": "UF de Nascimento"},
            {"id": "NomeCurso", "label": "Nome do Curso"},
            {"id": "CodigoEMECCurso", "label": "Código EMEC do Curso"},
            {"id": "GrauConferido", "label": "Grau Conferido"},
            {"id": "TituloConferido", "label": "Título Conferido"},
            {"id": "Modalidade", "label": "Modalidade"},
            {"id": "Habilitacao", "label": "Habilitação"},
            {"id": "CodigoDiploma", "label": "Código do Diploma"},
            {"id": "DataExpedicao", "label": "Data de Expedição"},
            {"id": "DataColacaoGrau", "label": "Data de Colação de Grau"},
            {"id": "DataRegistro", "label": "Data de Registro"},
            {"id": "LivroRegistro", "label": "Livro de Registro"},
            {"id": "FolhaRegistro", "label": "Folha de Registro"},
            {"id": "NumeroRegistro", "label": "Número de Registro"}
        ],
        "registradora": [
            {"id": "CodigoDiploma", "label": "Código do Diploma"},
            {"id": "CPFDetentor", "label": "CPF do Detentor"},
            {"id": "CodigoEMECEmissora", "label": "Código EMEC Emissora"},
            {"id": "CodigoEMECCurso", "label": "Código EMEC Curso"},
            {"id": "LivroRegistro", "label": "Livro de Registro"},
            {"id": "NumeroRegistro", "label": "Número de Registro"},
            {"id": "FolhaRegistro", "label": "Folha de Registro"},
            {"id": "DataColacaoGrau", "label": "Data de Colação de Grau"},
            {"id": "DataExpedicaoDiploma", "label": "Data de Expedição"},
            {"id": "DataRegistroDiploma", "label": "Data de Registro"},
            {"id": "ResponsavelRegistroNome", "label": "Responsável - Nome"},
            {"id": "ResponsavelRegistroCPF", "label": "Responsável - CPF"},
            {"id": "IdDocumentacaoAcademica", "label": "ID Documentação Acadêmica"}
        ]
    }

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5005, debug=True)

