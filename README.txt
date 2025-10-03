# Validador de Fiscalização MEC - Diploma Digital

Sistema web para validação e análise de arquivos XML de fiscalização do MEC no contexto do Diploma Digital, conforme especificação XSD versão 1.05.

![Python](https://img.shields.io/badge/python-3.8%2B-blue)
![Flask](https://img.shields.io/badge/flask-2.3-green)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 📋 Descrição

O **Validador de Fiscalização MEC** é uma aplicação web que auxilia instituições de ensino superior no processo de validação de arquivos XML de fiscalização do MEC, tanto para IES Emissoras quanto Registradoras de diplomas digitais.

### Funcionalidades Principais

- ✅ Validação de XMLs contra XSD oficial do MEC (v1.05)
- 📁 Suporte a múltiplos arquivos XML ou arquivo ZIP
- 🔍 Validação automática de XMLs de diplomados referenciados (Emissora)
- 📊 Visualização interativa de dados em tabelas configuráveis
- 📤 Exportação customizada para CSV
- 🎯 Detecção automática de tipo de arquivo (Emissora/Registradora)
- ⚠️ Relatórios detalhados de erros de validação
- 🖱️ Interface drag-and-drop intuitiva
- ⚡ Suporte a processamento de milhares de diplomas

## 🚀 Tecnologias

### Backend
- **Python 3.8+**
- **Flask 2.3** - Framework web
- **lxml 4.9** - Processamento e validação XML/XSD
- **pandas 2.0** - Manipulação de dados e exportação CSV
- **requests 2.31** - Requisições HTTP para buscar XMLs de diplomados
- **gunicorn 20.1** - Servidor WSGI de produção

### Frontend
- **HTML5/CSS3/JavaScript**
- **jQuery 3.7**
- **DataTables 1.13** - Tabelas interativas com busca e ordenação
- Design responsivo e moderno

## 📦 Instalação

### Pré-requisitos

- Python 3.8 ou superior
- pip (gerenciador de pacotes Python)
- Servidor web Apache (opcional, para proxy reverso)

### Passo 1: Clonar o repositório
```bash
git clone https://github.com/seu-usuario/validador-fiscalizacao-mec.git
cd validador-fiscalizacao-mec