var allFilesData={emissora:[],registradora:[]};
var availableFields={};
var dataTables={emissora:null,registradora:null};

document.querySelectorAll('.tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
        const tabName=tab.dataset.tab;
        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
        document.getElementById('tab-'+tabName).classList.add('active');
    });
});

const uploadArea=document.getElementById('uploadArea');
const fileInput=document.getElementById('fileInput');
const processBtn=document.getElementById('processBtn');
let selectedFiles=[];

uploadArea.addEventListener('click',()=>fileInput.click());
uploadArea.addEventListener('dragover',(e)=>{e.preventDefault();uploadArea.classList.add('drag-over')});
uploadArea.addEventListener('dragleave',()=>uploadArea.classList.remove('drag-over'));
uploadArea.addEventListener('drop',(e)=>{e.preventDefault();uploadArea.classList.remove('drag-over');handleFiles(Array.from(e.dataTransfer.files),'emissora')});
fileInput.addEventListener('change',(e)=>{handleFiles(Array.from(e.target.files),'emissora')});

const uploadAreaReg=document.getElementById('uploadAreaReg');
const fileInputReg=document.getElementById('fileInputReg');
const processBtnReg=document.getElementById('processBtnReg');
let selectedFilesReg=[];

uploadAreaReg.addEventListener('click',()=>fileInputReg.click());
uploadAreaReg.addEventListener('dragover',(e)=>{e.preventDefault();uploadAreaReg.classList.add('drag-over')});
uploadAreaReg.addEventListener('dragleave',()=>uploadAreaReg.classList.remove('drag-over'));
uploadAreaReg.addEventListener('drop',(e)=>{e.preventDefault();uploadAreaReg.classList.remove('drag-over');handleFiles(Array.from(e.dataTransfer.files),'registradora')});
fileInputReg.addEventListener('change',(e)=>{handleFiles(Array.from(e.target.files),'registradora')});

function handleFiles(files,tipo){
    const filtered=files.filter(f=>f.name.toLowerCase().endsWith('.xml')||f.name.toLowerCase().endsWith('.zip'));
    if(filtered.length===0){
        alert('Por favor, selecione arquivos XML ou ZIP válidos.');
        return;
    }
    if(tipo==='emissora'){
        selectedFiles=filtered;
        displayFileList(filtered,'fileList');
        processBtn.disabled=false;
    }else{
        selectedFilesReg=filtered;
        displayFileList(filtered,'fileListReg');
        processBtnReg.disabled=false;
    }
}

function displayFileList(files,containerId){
    const container=document.getElementById(containerId);
    container.style.display='block';
    container.innerHTML='<div class="file-list">'+files.map((f,i)=>'<div class="file-item"><span>'+(f.name.endsWith('.zip')?'📦':'📄')+'</span><span class="file-name">'+f.name+'</span><span class="file-remove" onclick="removeFile('+i+',\''+containerId+'\')">×</span></div>').join('')+'</div>';
}

function removeFile(index,listId){
    if(listId==='fileList'){
        selectedFiles.splice(index,1);
        if(selectedFiles.length===0){
            document.getElementById('fileList').style.display='none';
            processBtn.disabled=true;
        }else{
            displayFileList(selectedFiles,'fileList');
        }
    }else{
        selectedFilesReg.splice(index,1);
        if(selectedFilesReg.length===0){
            document.getElementById('fileListReg').style.display='none';
            processBtnReg.disabled=true;
        }else{
            displayFileList(selectedFilesReg,'fileListReg');
        }
    }
}

processBtn.addEventListener('click',()=>processFiles('emissora'));
processBtnReg.addEventListener('click',()=>processFiles('registradora'));

function clearPreviousResults(tipo){
    document.getElementById(tipo==='emissora'?'validationReport':'validationReportReg').innerHTML='';
    document.getElementById(tipo==='emissora'?'iesFilesList':'iesFilesListReg').style.display='none';
    // NÃO esconder o dataContainer aqui
    allFilesData[tipo]=[];
    if(dataTables[tipo]){
        try{
            dataTables[tipo].destroy();
            dataTables[tipo]=null;
        }catch(e){
            console.log('Erro ao destruir tabela:',e);
        }
    }
}

async function processFiles(tipo){
    clearPreviousResults(tipo);
    const loader=document.getElementById(tipo==='emissora'?'loader':'loaderReg');
    const btn=tipo==='emissora'?processBtn:processBtnReg;
    const files=tipo==='emissora'?selectedFiles:selectedFilesReg;
    
    loader.classList.add('active');
    btn.disabled=true;
    
    const formData=new FormData();
    const isZip=files.length===1&&files[0].name.toLowerCase().endsWith('.zip');
    
    if(isZip){
        formData.append('file',files[0]);
    }else{
        files.forEach(file=>formData.append('files',file));
    }
    
    formData.append('tipo',tipo);
    
    try{
        const endpoint=isZip?'/fiscalizacao/api/process-zip':'/fiscalizacao/api/process-files';
        const response=await fetch(endpoint,{method:'POST',body:formData});
        
        if(!response.ok){
            throw new Error('Erro HTTP '+response.status+': '+response.statusText);
        }
        
        const data=await response.json();
        
        if(data.error){
            throw new Error(data.error);
        }
        
        availableFields=data.available_fields;
        allFilesData[tipo]=data.files||[];
        
        displayValidationReport(allFilesData[tipo],tipo);
        displayIESFilesList(allFilesData[tipo],tipo);
        initializeFieldConfig(tipo);
        updateTable(tipo);
        
    }catch(error){
        const containerId=tipo==='emissora'?'validationReport':'validationReportReg';
        const container=document.getElementById(containerId);
        container.innerHTML='<div class="alert error"><strong>✗ Erro ao Processar</strong><br>'+
            'Erro: '+error.message+
            '<br><small>Verifique se os arquivos XML estão bem formados e se o servidor está acessível.</small></div>';
        console.error('Erro detalhado:',error);
    }finally{
        loader.classList.remove('active');
        btn.disabled=false;
    }
}

function displayValidationReport(files,tipo){
    const containerId=tipo==='emissora'?'validationReport':'validationReportReg';
    const container=document.getElementById(containerId);
    const validFiles=files.filter(f=>f.report.ok);
    const invalidFiles=files.filter(f=>!f.report.ok);
    
    let html='';
    if(invalidFiles.length===0){
        html+='<div class="alert success"><strong>✓ Validação Concluída</strong><br>Todos os '+files.length+' arquivo(s) validados com sucesso!</div>';
    }else if(validFiles.length===0){
        html+='<div class="alert error"><strong>✗ Erros de Validação</strong><br>Todos os '+files.length+' arquivo(s) falharam na validação.</div>';
    }else{
        html+='<div class="alert warning"><strong>⚠ Validação Parcial</strong><br>'+validFiles.length+' de '+files.length+' arquivo(s) validados com sucesso. '+invalidFiles.length+' arquivo(s) com erro.</div>';
    }
    
    files.forEach(file=>{
        const info=file.report;
        const cssClass=info.ok?'':' error';
        const icon=info.ok?'✓':'✗';
        html+='<div class="file-validation'+cssClass+'"><strong>'+icon+' '+file.filename+'</strong> - Tipo: '+info.tipo;
        
        if(info.errors&&info.errors.length>0){
            html+='<div class="validation-errors"><strong>Erros:</strong><ul>';
            info.errors.forEach(err=>{html+='<li>'+err+'</li>'});
            html+='</ul></div>';
        }
        
        if(info.validation_errors&&info.validation_errors.length>0){
            html+='<div class="validation-errors"><strong>Erros em XMLs de Diplomado:</strong><ul>';
            info.validation_errors.forEach(verr=>{
                html+='<li>URL: '+verr.url+'<ul>';
                verr.errors.forEach(e=>html+='<li>'+e+'</li>');
                html+='</ul></li>';
            });
            html+='</ul></div>';
        }
        
        if(info.fetch_errors&&info.fetch_errors.length>0){
            html+='<div class="validation-errors"><strong>Erros ao buscar XMLs:</strong><ul>';
            info.fetch_errors.forEach(ferr=>{html+='<li>'+ferr.url+': '+ferr.error+'</li>'});
            html+='</ul></div>';
        }
        html+='</div>';
    });
    
    container.innerHTML=html;
}

function displayIESFilesList(files,tipo){
    const containerId=tipo==='emissora'?'iesFilesList':'iesFilesListReg';
    const container=document.getElementById(containerId);
    if(files.length===0)return;
    
    const validFiles=files.filter(f=>f.report.ok&&!f.report.wrong_type);
    if(validFiles.length===0){
        container.style.display='none';
        return;
    }
    
    let html='<div class="ies-files-list"><h3>Arquivos Processados</h3>';
    validFiles.forEach((file,idx)=>{
        const cssClass='';
        const icon='✓';
        html+='<div class="ies-file-item '+cssClass+'">';
        html+='<div class="ies-file-header">';
        html+='<input type="checkbox" class="ies-file-checkbox" data-tipo="'+tipo+'" id="file-'+tipo+'-'+idx+'" data-filename="'+file.filename+'" checked onchange="updateTable(\''+tipo+'\')">';
        html+='<label for="file-'+tipo+'-'+idx+'" class="ies-file-name">'+icon+' '+file.filename+'</label>';
        html+='</div>';
        if(file.ies_info){
            const ies=file.ies_info;
            const dates=file.dates_info;
            html+='<div class="ies-file-info">';
            html+='<div class="ies-info-item"><span class="ies-info-label">Nome:</span><span class="ies-info-value">'+(ies.Nome||'-')+'</span></div>';
            html+='<div class="ies-info-item"><span class="ies-info-label">Código MEC:</span><span class="ies-info-value">'+(ies.CodigoMEC||'-')+'</span></div>';
            html+='<div class="ies-info-item"><span class="ies-info-label">CNPJ:</span><span class="ies-info-value">'+(ies.CNPJ||'-')+'</span></div>';
            html+='<div class="ies-info-item"><span class="ies-info-label">Município/UF:</span><span class="ies-info-value">'+(ies.Municipio||'-')+' / '+(ies.UF||'-')+'</span></div>';
            html+='<div class="ies-info-item"><span class="ies-info-label">Período:</span><span class="ies-info-value">'+(dates.DataInicioFiscalizacao||'-')+' a '+(dates.DataFimFiscalizacao||'-')+'</span></div>';
            html+='<div class="ies-info-item"><span class="ies-info-label">Diplomas:</span><span class="ies-info-value">'+file.diplomas.length+'</span></div>';
            html+='</div>';
        }
        html+='</div>';
    });
    html+='</div>';
    container.innerHTML=html;
    container.style.display='block';
}

function initializeFieldConfig(tipo){
    const fields=availableFields[tipo]||[];
    const containerId=tipo==='emissora'?'fieldList':'fieldListReg';
    const container=document.getElementById(containerId);
    
    let html='';
    fields.forEach((field)=>{
        html+='<div class="field-item" draggable="true" data-field="'+field.id+'">';
        html+='<span class="drag-handle">☰</span>';
        html+='<input type="checkbox" id="'+tipo+'-field-'+field.id+'" value="'+field.id+'" checked>';
        html+='<label for="'+tipo+'-field-'+field.id+'">'+field.label+'</label>';
        html+='</div>';
    });
    
    container.innerHTML=html;
    container.querySelectorAll('input[type="checkbox"]').forEach(cb=>{
        cb.addEventListener('change',()=>updateTable(tipo));
    });
    addDragAndDrop(container,tipo);
}

function addDragAndDrop(container,tipo){
    let draggedElement=null;
    container.querySelectorAll('.field-item').forEach(item=>{
        item.addEventListener('dragstart',()=>{
            draggedElement=item;
            item.style.opacity='0.5';
        });
        item.addEventListener('dragend',()=>{
            item.style.opacity='1';
            draggedElement=null;
            updateTable(tipo);
        });
        item.addEventListener('dragover',(e)=>{
            e.preventDefault();
            if(draggedElement&&draggedElement!==item){
                const rect=item.getBoundingClientRect();
                const midpoint=rect.top+rect.height/2;
                if(e.clientY<midpoint){
                    container.insertBefore(draggedElement,item);
                }else{
                    container.insertBefore(draggedElement,item.nextSibling);
                }
            }
        });
    });
    container.addEventListener('drop',(e)=>{e.preventDefault()});
}

function getSelectedFields(tipo){
    const containerId=tipo==='emissora'?'fieldList':'fieldListReg';
    const container=document.getElementById(containerId);
    const fields=[];
    container.querySelectorAll('.field-item').forEach(item=>{
        const checkbox=item.querySelector('input[type="checkbox"]');
        if(checkbox.checked){
            const fieldId=checkbox.value;
            const label=item.querySelector('label').textContent;
            fields.push({id:fieldId,label:label});
        }
    });
    return fields;
}

function getSelectedFiles(tipo){
    const listId=tipo==='emissora'?'iesFilesList':'iesFilesListReg';
    const container=document.getElementById(listId);
    if(!container)return[];
    const checkboxes=container.querySelectorAll('.ies-file-checkbox[data-tipo="'+tipo+'"]');
    const selected=[];
    checkboxes.forEach(cb=>{
        if(cb.checked){
            selected.push(cb.dataset.filename);
        }
    });
    return selected;
}

function selectAllFields(){
    document.querySelectorAll('#fieldList input[type="checkbox"]').forEach(cb=>cb.checked=true);
    updateTable('emissora');
}

function deselectAllFields(){
    document.querySelectorAll('#fieldList input[type="checkbox"]').forEach(cb=>cb.checked=false);
    updateTable('emissora');
}

function selectAllFieldsReg(){
    document.querySelectorAll('#fieldListReg input[type="checkbox"]').forEach(cb=>cb.checked=true);
    updateTable('registradora');
}

function deselectAllFieldsReg(){
    document.querySelectorAll('#fieldListReg input[type="checkbox"]').forEach(cb=>cb.checked=false);
    updateTable('registradora');
}

function updateTable(tipo){
    const files=allFilesData[tipo];
    const tableId=tipo==='emissora'?'dataTable':'dataTableReg';
    const containerId=tipo==='emissora'?'dataContainer':'dataContainerReg';
    const dataContainer=document.getElementById(containerId);
    
    // Se não há arquivos carregados, não fazer nada
    if(!files||files.length===0){
        console.log('Nenhum arquivo carregado para',tipo);
        return;
    }
    
    // SEMPRE mostrar o container quando há arquivos carregados
    dataContainer.style.display='flex';
    
    const tableContainer=dataContainer.querySelector('.table-container');
    const selectedFiles=getSelectedFiles(tipo);
    const allDiplomas=[];
    
    files.forEach(file=>{
        if(selectedFiles.includes(file.filename)&&file.diplomas&&file.report.ok&&!file.report.wrong_type){
            allDiplomas.push(...file.diplomas);
        }
    });
    
    if(allDiplomas.length===0){
        console.log('Nenhum diploma selecionado para',tipo);
        if(dataTables[tipo]){
            try{
                dataTables[tipo].destroy();
                dataTables[tipo]=null;
            }catch(e){
                console.log('Erro ao destruir tabela:',e);
            }
        }
        tableContainer.innerHTML='<div style="padding:40px;text-align:center;color:#666;border:2px dashed #ddd;border-radius:8px;"><p style="font-size:18px;margin-bottom:10px;"><strong>📋 Nenhum arquivo selecionado</strong></p><p>Selecione pelo menos um arquivo na lista acima para visualizar os dados.</p></div>';
        return;
    }
    
    const selectedFields=getSelectedFields(tipo);
    if(selectedFields.length===0){
        if(dataTables[tipo]){
            try{
                dataTables[tipo].destroy();
                dataTables[tipo]=null;
            }catch(e){
                console.log('Erro ao destruir tabela:',e);
            }
        }
        tableContainer.innerHTML='<div style="padding:40px;text-align:center;color:#dc3545;border:2px dashed #dc3545;border-radius:8px;background:#fff5f5;"><p style="font-size:18px;margin-bottom:10px;"><strong>⚠ Nenhuma coluna selecionada</strong></p><p>Selecione pelo menos uma coluna no painel de configuração ao lado para visualizar os dados na tabela.</p></div>';
        return;
    }
    
    if(dataTables[tipo]){
        try{
            dataTables[tipo].destroy();
            $('#'+tableId).remove();
        }catch(e){
            console.log('Erro ao destruir tabela:',e);
        }
    }
    
    tableContainer.innerHTML='<table id="'+tableId+'" class="display" style="width:100%"></table>';
    
    const columns=selectedFields.map(field=>({
        title:field.label,
        data:field.id,
        defaultContent:'-'
    }));
    
    try{
        dataTables[tipo]=$('#'+tableId).DataTable({
            data:allDiplomas,
            columns:columns,
            pageLength:25,
            language:{
                url:'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
            },
            scrollX:true,
            dom:'frtip',
            destroy:true,
            responsive:false,
            searching:true,
            ordering:true
        });
    }catch(e){
        console.error('Erro ao criar DataTable:',e);
        tableContainer.innerHTML='<div style="padding:40px;text-align:center;color:#dc3545;border:2px solid #dc3545;border-radius:8px;background:#fff5f5;"><p style="font-size:18px;margin-bottom:10px;"><strong>✗ Erro ao criar tabela</strong></p><p>'+e.message+'</p></div>';
    }
}

async function exportToCSV(){
    await exportCSVCommon('emissora');
}

async function exportToCSVReg(){
    await exportCSVCommon('registradora');
}

async function exportCSVCommon(tipo){
    const selectedFilesNames=getSelectedFiles(tipo);
    if(selectedFilesNames.length===0){
        alert('Selecione pelo menos um arquivo');
        return;
    }
    
    const selectedFields=getSelectedFields(tipo);
    if(selectedFields.length===0){
        alert('Selecione pelo menos uma coluna');
        return;
    }
    
    const exportData={
        selected_files:selectedFilesNames,
        fields:selectedFields.map(f=>f.id),
        files_data:allFilesData[tipo]
    };
    
    try{
        const response=await fetch('/fiscalizacao/api/export-csv',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(exportData)
        });
        
        const blob=await response.blob();
        const url=window.URL.createObjectURL(blob);
        const a=document.createElement('a');
        a.href=url;
        a.download='fiscalizacao_'+tipo+'_'+new Date().getTime()+'.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }catch(error){
        alert('Erro ao exportar CSV: '+error.message);
    }
}

