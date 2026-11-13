const $ = (id) => document.getElementById(id);
const municipal = "MUNICIPALIDAD DISTRITAL DE CHINCHAO";
let folios = [];
let entries = [];
let reorderMode = false;
let localMode = false;
let currentPage = 0;
let sortByBlock = false;
const PAGE_SIZE = 20;
const FOLIO_STORAGE_KEY = "caratulas-folio-municipal-v1";
const EXPORT_STORAGE_KEY = "caratulas-folio-exports-v1";

$("municipalityName").textContent = municipal;
$("sheetMunicipality").textContent = municipal;

function newEntry(type="document") { return type === "separator" ? {type,title:""} : {type,name:"",detail:"",notePages:"",totalPages:""}; }
function countPages(note) {
  const ranges=[];
  for(const part of String(note||"").split(/[;,\n]+/)){
    const match=part.trim().match(/^(\d+)\s*(?:[-–—]\s*(\d+))?$/);
    if(!match)continue;
    const first=Number(match[1]),last=match[2]?Number(match[2]):first;
    if(first<1||last<1)continue;
    ranges.push([Math.min(first,last),Math.max(first,last)]);
  }
  ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  let total=0,start=null,end=null;
  for(const [nextStart,nextEnd] of ranges){
    if(start===null){start=nextStart;end=nextEnd;continue;}
    if(nextStart<=end+1)end=Math.max(end,nextEnd);
    else{total+=end-start+1;start=nextStart;end=nextEnd;}
  }
  if(start!==null)total+=end-start+1;
  return total||"";
}
function esc(value="") { return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
function localRead(key,fallback=[]) { try { const value=JSON.parse(localStorage.getItem(key)||"null");return value??fallback; } catch { return fallback; } }
function localWrite(key,value) { try { localStorage.setItem(key,JSON.stringify(value));return true; } catch { alert("El almacenamiento local está lleno. Descarga o elimina exportaciones antiguas para liberar espacio.");return false; } }
function setConnectionStatus(text,offline=false) { const status=$("connectionStatus");status.textContent=`● ${text}`;status.classList.toggle("offline",offline); }
function readForm() {
  return {folio:$("folio").value.trim(),bloque:$("bloque").value.trim(),periodo:$("periodo").value.trim(),ubicacion:$("ubicacion").value.trim(),tipoDocumento:$("tipoDocumento").value.trim(),observaciones:$("observaciones").value.trim(),entries:entries.map(entry=>({...entry}))};
}
function normalizeFolios(items){return (Array.isArray(items)?items:[]).map(item=>({...item,tipoDocumento:item.tipoDocumento||(item.entries||[]).find(entry=>entry.documentType)?.documentType||"",entries:(item.entries||[]).map(entry=>{const {documentType,...rest}=entry;return {...rest,type:entry.type==="separator"?"separator":"document"};})}));}
function mergeCachedFolios(remote){const cached=normalizeFolios(localRead(FOLIO_STORAGE_KEY,[]));const cacheById=new Map(cached.map(item=>[item.id,item]));const seen=new Set();let hasLocalChanges=false;const merged=remote.map(item=>{seen.add(item.id);const saved=cacheById.get(item.id);if(saved&&Date.parse(saved.updatedAt||saved.createdAt||0)>Date.parse(item.updatedAt||item.createdAt||0)){hasLocalChanges=true;return saved;}return item;});cached.forEach(item=>{if(!seen.has(item.id)&&String(item.id).startsWith("local-")){merged.push(item);hasLocalChanges=true;}});return {items:merged,hasLocalChanges};}
function addEntry(type="document") { entries.push(newEntry(type)); renderEntries(); const input=$("entries").querySelector(`.entry-card:last-child input`); input?.focus(); }
function renderEntries() {
  const root=$("entries"); root.replaceChildren();
  entries.forEach((entry,index)=>{
    const card=document.createElement("div"); card.className=`entry-card ${entry.type==="separator"?"separator-card":""}`;
    if(reorderMode){const move=document.createElement("div");move.className="move-controls";[["↑","Subir",-1],["↓","Bajar",1]].forEach(([text,title,offset])=>{const button=document.createElement("button");button.type="button";button.textContent=text;button.title=title;button.disabled=index+offset<0||index+offset>=entries.length;button.onclick=()=>{[entries[index],entries[index+offset]]=[entries[index+offset],entries[index]];renderEntries();};move.append(button);});card.append(move);}
    if(entry.type==="separator"){
      const input=document.createElement("input");input.placeholder="Título del separador o tema";input.value=entry.title||"";input.setAttribute("aria-label","Título del separador");input.oninput=()=>entry.title=input.value;card.append(input);
    }else{
      const name=document.createElement("input");name.placeholder="Datos registrados (nombre / asunto)";name.value=entry.name||"";name.setAttribute("aria-label","Datos registrados");name.oninput=()=>entry.name=name.value;
      const detail=document.createElement("input");detail.placeholder="Cargo / detalle";detail.value=entry.detail||"";detail.setAttribute("aria-label","Cargo o detalle");detail.oninput=()=>entry.detail=detail.value;
      const note=document.createElement("input");note.placeholder="Nota de páginas (ej. 01-13)";note.value=entry.notePages||"";note.setAttribute("aria-label","Nota de páginas");note.oninput=()=>{entry.notePages=note.value;entry.totalPages=countPages(note.value);total.value=entry.totalPages;renderSheet();};
      const total=document.createElement("input");total.placeholder="Total automático";total.type="number";total.min="0";total.value=countPages(entry.notePages)||entry.totalPages||"";entry.totalPages=total.value;total.readOnly=true;total.className="page-count-result";total.setAttribute("aria-label","Total automático de páginas");
      card.append(name,detail,note,total);
    }
    const remove=document.createElement("button");remove.type="button";remove.className="remove-entry";remove.textContent="×";remove.title="Quitar fila";remove.onclick=()=>{entries.splice(index,1);renderEntries();};card.append(remove);root.append(card);
  });
  $("peopleCount").textContent=String(entries.filter(entry=>entry.type!=="separator").length);
}
function clearForm() { $("folioForm").reset(); $("folioId").value=""; entries=[]; reorderMode=false; $("formTitle").textContent="Nuevo folio"; $("saveButton").textContent="Guardar folio"; renderEntries(); }
function editFolio(item) {
  $("folioId").value=item.id; ["folio","bloque","periodo","ubicacion","tipoDocumento","observaciones"].forEach(key=>$(key).value=item[key]||"");
  entries=(item.entries||[]).map(entry=>({...entry,type:entry.type==="separator"?"separator":"document"})); reorderMode=false; renderEntries(); $("formTitle").textContent="Editar folio"; $("saveButton").textContent="Guardar cambios"; $("folioForm").scrollIntoView({behavior:"smooth",block:"start"});
}
function normalizeSearch(value="") { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("es").replace(/\s+/g," ").trim(); }
function matchesFolio(item,query) {
  const normalized=normalizeSearch(query);if(!normalized)return true;
  const clean=normalized.replace(/[^a-z0-9-]+/g," ").trim();
  const folioQuery=clean.match(/^(?:(?:folio\s*(?:nro|numero|n)?|nro|numero|n)\s*)?0*(\d{1,3})$/);
  if(folioQuery){const value=String(item.folio||"").trim();return value===folioQuery[1]||(/^\d+$/.test(value)&&Number(value)===Number(folioQuery[1]));}
  const blockQuery=clean.match(/^blo[a-z]*(?:\s*0*(\d+))?$/);
  if(blockQuery){const value=String(item.bloque||"").trim();return blockQuery[1]?value===blockQuery[1]||(/^\d+$/.test(value)&&Number(value)===Number(blockQuery[1])):Boolean(value);}
  if(/^\d{4}(?:\s*-\s*\d{4})?$/.test(clean))return normalizeSearch(item.periodo)===clean.replace(/\s/g,"");
  const documents=(item.entries||[]).flatMap(entry=>[entry.name,entry.detail,entry.notePages,entry.totalPages,entry.title]);
  const searchable=normalizeSearch([item.folio,item.bloque,item.periodo,item.ubicacion,item.tipoDocumento,item.observaciones,...documents].filter(Boolean).join(" ")).replace(/[^a-z0-9]+/g," ");
  const terms=clean.replace(/-/g," ").split(/\s+/).filter(Boolean);
  return terms.length>0&&terms.every(term=>searchable.includes(term));
}
function filteredFolios() { const query=$("searchFolios").value;return folios.filter(item=>matchesFolio(item,query)); }
function foliosWithDocuments(items) { return items.filter(item=>(item.entries||[]).some(entry=>entry.type!=="separator")); }
function sortedFolios(items) { return [...items].sort((a,b)=>{if(sortByBlock){const block=String(a.bloque||"").localeCompare(String(b.bloque||""),"es",{numeric:true});if(block)return block;return String(a.folio||"").localeCompare(String(b.folio||""),"es",{numeric:true});}const date=item=>{const timestamp=Date.parse(item.updatedAt||item.createdAt||"");return Number.isFinite(timestamp)?timestamp:Number.parseInt(String(item.id||"").replace(/^local-/,""),10)||0;};return date(b)-date(a);}); }
function renderSheet() {
  const root=$("folioRows");root.replaceChildren();const visible=sortedFolios(foliosWithDocuments(filteredFolios()));const pageCount=Math.max(1,Math.ceil(visible.length/PAGE_SIZE));currentPage=Math.min(currentPage,pageCount-1);const start=currentPage*PAGE_SIZE;const pageItems=visible.slice(start,start+PAGE_SIZE);let index=visible.slice(0,start).reduce((sum,item)=>sum+(item.entries||[]).filter(entry=>entry.type!=="separator").length,0);const firstIndex=index;
  pageItems.forEach(item=>{
    const documents=(item.entries||[]).map((entry,entryIndex)=>({entry,entryIndex})).filter(row=>row.entry.type!=="separator");const hasEntries=documents.length>0;const lines=hasEntries?documents:[{entry:{type:"document",name:"",detail:""},entryIndex:-1}];
    lines.forEach(({entry,entryIndex})=>{
      const tr=document.createElement("tr");if(index%2)tr.classList.add("banded");
      const values=[index+1,item.bloque,item.folio,item.periodo,item.ubicacion,item.tipoDocumento,entry.name,entry.detail,entry.notePages,entry.totalPages];
      values.forEach((value,column)=>{const td=document.createElement("td");td.textContent=value||"";if(column===0)td.className="center-cell";tr.append(td);});
      const actions=document.createElement("td");actions.className="sheet-actions";const edit=document.createElement("button");edit.type="button";edit.textContent="Editar";edit.onclick=()=>editFolio(item);const del=document.createElement("button");del.type="button";del.textContent="Borrar";del.title=hasEntries?"Borrar únicamente este documento":"No hay documentos que borrar";del.disabled=!hasEntries;if(hasEntries)del.onclick=()=>deleteDocument(item,entryIndex);actions.append(edit,del);tr.append(actions);root.append(tr);index++;
    });
  });
  $("emptyState").hidden=visible.length>0;const totalDocuments=visible.reduce((sum,item)=>sum+(item.entries||[]).filter(entry=>entry.type!=="separator").length,0);const pageDocumentCount=pageItems.reduce((sum,item)=>sum+(item.entries||[]).filter(entry=>entry.type!=="separator").length,0);const firstDocument=pageDocumentCount?firstIndex+1:0;$("rowCount").textContent=`${totalDocuments} ${totalDocuments===1?"documento":"documentos"}`;$("searchSummary").textContent=visible.length?`${totalDocuments} documentos en ${visible.length} folios · mostrando ${firstDocument}–${firstIndex+pageDocumentCount}`:"Sin coincidencias";const emptyTitle=$("emptyState").querySelector("strong");const emptyText=$("emptyState").querySelector("span");if(!visible.length&&$("searchFolios").value.trim()){emptyTitle.textContent="No se encontraron coincidencias";emptyText.textContent="Prueba con un folio, bloque, periodo, nombre o documento.";}else{emptyTitle.textContent="Tu hoja de folios está lista";emptyText.textContent="Agrega documentos encontrados a un folio para verlos aquí.";}
  const select=$("pageSelect");select.replaceChildren();for(let page=0;page<pageCount;page++){const option=document.createElement("option");option.value=String(page);option.textContent=String(page+1);select.append(option);}select.value=String(currentPage);$("pageTotal").textContent=`de ${pageCount}`;$("firstPage").disabled=$("previousPage").disabled=currentPage===0;$("lastPage").disabled=$("nextPage").disabled=currentPage>=pageCount-1;$("sortFoliosButton").textContent=sortByBlock?"↕ Ordenar por reciente":"↕ Ordenar por bloque";
}
async function loadFolios() { try {const response=await fetch("/api/folios");if(!response.ok)throw Error("API no disponible");const merged=mergeCachedFolios(normalizeFolios(await response.json()));folios=merged.items;localMode=merged.hasLocalChanges;localWrite(FOLIO_STORAGE_KEY,folios);setConnectionStatus(localMode?"Cambios guardados en navegador":"Conectado",localMode);}catch{localMode=true;folios=normalizeFolios(localRead(FOLIO_STORAGE_KEY,[]));setConnectionStatus("Guardado en este navegador",true);}renderSheet(); }
async function persistFolio(payload,id) {
  if(localMode){const position=folios.findIndex(item=>item.id===id);if(position>=0)folios[position]={...folios[position],...payload,id,updatedAt:new Date().toISOString()};else folios.push({...payload,id:`local-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,createdAt:new Date().toISOString()});localWrite(FOLIO_STORAGE_KEY,folios);return;}
  try{const response=await fetch(id?`/api/folios/${encodeURIComponent(id)}`:"/api/folios",{method:id?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json().catch(()=>({}));if(!response.ok){if(response.status===422)throw new Error(result.error||"Revisa los datos del folio.");const error=new Error("La API de guardado no está disponible para este formato de registro.");error.offline=true;throw error;}return;}
  catch(error){if(!error.offline&&error instanceof Error&&error.message!=="Failed to fetch"&&error.name!=="TypeError")throw error;localMode=true;setConnectionStatus("Guardado en este navegador",true);const position=folios.findIndex(item=>item.id===id);if(position>=0)folios[position]={...folios[position],...payload,id,updatedAt:new Date().toISOString()};else folios.push({...payload,id:`local-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,createdAt:new Date().toISOString()});localWrite(FOLIO_STORAGE_KEY,folios);}
}
async function deleteDocument(item,entryIndex) {
  const selected=item.entries?.[entryIndex];if(!selected)return;
  const label=selected.type==="separator"?selected.title:(selected.name||selected.detail||"documento");
  if(!confirm(`¿Borrar únicamente “${label}” del folio ${item.folio}?`))return;
  const updated={...item,entries:item.entries.filter((_,index)=>index!==entryIndex)};
  try{await persistFolio(updated,item.id);if($("folioId").value===item.id)entries=updated.entries.map(entry=>({...entry}));await loadFolios();if($("folioId").value===item.id)renderEntries();}
  catch(error){alert(error.message||"No se pudo borrar el documento.");}
}
$("folioForm").addEventListener("submit",async event=>{
  event.preventDefault();if(!$("folioForm").reportValidity())return;const id=$("folioId").value;const payload=readForm();try{await persistFolio(payload,id);clearForm();await loadFolios();}catch(error){alert(error.message||"No se pudo guardar el folio.");}
});
$("folioForm").addEventListener("reset",()=>setTimeout(()=>{ $("folioId").value="";entries=[];reorderMode=false;renderEntries();$("formTitle").textContent="Nuevo folio";$("saveButton").textContent="Guardar folio"; },0));
$("addPerson").onclick=()=>addEntry("document");$("addSeparator").onclick=()=>addEntry("separator");$("reorderEntries").onclick=()=>{reorderMode=!reorderMode;renderEntries();};
let searchTimer;$("searchFolios").addEventListener("input",()=>{currentPage=0;clearTimeout(searchTimer);searchTimer=setTimeout(renderSheet,220);});$("sortFoliosButton").onclick=()=>{sortByBlock=!sortByBlock;currentPage=0;renderSheet();};$("firstPage").onclick=()=>{currentPage=0;renderSheet();};$("previousPage").onclick=()=>{currentPage=Math.max(0,currentPage-1);renderSheet();};$("nextPage").onclick=()=>{currentPage++;renderSheet();};$("lastPage").onclick=()=>{currentPage=Math.max(0,Math.ceil(foliosWithDocuments(filteredFolios()).length/PAGE_SIZE)-1);renderSheet();};$("pageSelect").onchange=()=>{currentPage=Number($("pageSelect").value)||0;renderSheet();};
function printFolio(item) {
  const cover=$("printCover");cover.replaceChildren();const title=document.createElement("h1");title.textContent=municipal;const office=document.createElement("h2");office.textContent=item.ubicacion||"ARCHIVO MUNICIPAL";const heading=document.createElement("h3");heading.textContent=item.tipoDocumento||"REGISTRO DE DOCUMENTOS";const number=document.createElement("div");number.className="cover-number";number.textContent=`FOLIO N.º ${item.folio}`;const meta=document.createElement("p");meta.textContent=`BLOQUE ${item.bloque||"—"}  ·  PERIODO ${item.periodo}`;const list=document.createElement("div");list.className="cover-entries";(item.entries||[]).forEach(entry=>{const row=document.createElement("p");row.className=entry.type==="separator"?"cover-separator":"";row.textContent=entry.type==="separator"?entry.title:`${entry.name||""}${entry.detail?` — ${entry.detail}`:""}${entry.totalPages?` (${entry.totalPages} págs.)`:""}`;list.append(row);});const notes=document.createElement("p");notes.className="cover-notes";notes.textContent=item.observaciones||"";cover.append(title,office,heading,number,meta,list,notes);$("documentPreviewModal").hidden=false;
}
function exportExcel() {
  const snapshot=foliosWithDocuments(filteredFolios()).map(item=>({...item,entries:(item.entries||[]).filter(entry=>entry.type!=="separator")}));
  let rowNumber=0;const rows=snapshot.flatMap(item=>item.entries.map(entry=>[++rowNumber,item.bloque,item.folio,item.periodo,item.ubicacion,item.tipoDocumento,entry.name,entry.detail,entry.notePages,entry.totalPages]));
  const headers=["N.º","N.º Bloque","N.º Folio","Periodo","Ubicación del documento","Tipo de documento","Datos registrados","Cargo / detalle","Nota de páginas","Total páginas"];
  const widths=[48,82,80,90,220,195,240,225,125,100];const border="border:1px solid #c8cdd1;";const textCell=`${border}padding:7px 8px;font-family:Calibri,Arial,sans-serif;font-size:11pt;vertical-align:middle;white-space:normal;mso-number-format:'\\@';`;const titleStyle=`${border}background-color:#237a35;color:#ffffff;text-align:center;font-family:Calibri,Arial,sans-serif;font-size:14pt;font-weight:bold;padding:8px;`;const subtitleStyle=`${border}background-color:#d8ead4;text-align:center;font-family:Calibri,Arial,sans-serif;font-size:11pt;font-weight:bold;padding:7px;`;const headerStyle=`${border}background-color:#f4c542;text-align:center;font-family:Calibri,Arial,sans-serif;font-size:10pt;font-weight:bold;padding:8px;`;const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta name="ProgId" content="Excel.Sheet"><meta name="Generator" content="Microsoft Excel"><style>table{border-collapse:collapse;table-layout:fixed;width:1405px}td{mso-wrap-text:yes}</style></head><body><table><colgroup>${widths.map(width=>`<col width="${width}" style="width:${width}px">`).join("")}</colgroup><tr><td colspan="10" bgcolor="#237a35" style="${titleStyle}">${esc(municipal)}</td></tr><tr><td colspan="10" bgcolor="#d8ead4" style="${subtitleStyle}">REGISTRO DE DOCUMENTOS POR FOLIO</td></tr><tr>${headers.map((value,index)=>`<td width="${widths[index]}" bgcolor="#f4c542" style="${headerStyle}">${esc(value)}</td>`).join("")}</tr>${rows.map((row,rowIndex)=>{const fill=rowIndex%2===1?"#dce8f3":"#ffffff";return `<tr>${row.map((value,column)=>`<td width="${widths[column]}" bgcolor="${fill}" style="${textCell}background-color:${fill};${column===0?"text-align:center;":""}">${esc(value)}</td>`).join("")}</tr>`;}).join("")}</table></body></html>`;
  const date=new Date();const stamp=date.toISOString().slice(0,16).replace(/[:T]/g,"-");const filename=`Registro_de_folios_${stamp}.xls`;const history=localRead(EXPORT_STORAGE_KEY,[]);history.unshift({id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,filename,createdAt:date.toISOString(),count:snapshot.length,html});
  if(!localWrite(EXPORT_STORAGE_KEY,history.slice(0,20)))setConnectionStatus("Historial lleno",true);downloadExportHtml(html,filename);renderExportHistory();
}
function downloadExportHtml(html,filename){const blob=new Blob(["\ufeff",html],{type:"application/vnd.ms-excel;charset=utf-8"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
function renderExportHistory(){const history=localRead(EXPORT_STORAGE_KEY,[]);const root=$("exportHistory");root.replaceChildren();$("clearHistory").hidden=history.length===0;if(!history.length){const empty=document.createElement("p");empty.className="history-empty";empty.textContent="Todavía no has exportado ningún archivo.";root.append(empty);return;}history.forEach(item=>{const card=document.createElement("article");card.className="history-item";const icon=document.createElement("div");icon.className="history-file-icon";icon.textContent="XLS";const info=document.createElement("div");info.className="history-info";const name=document.createElement("strong");name.textContent=item.filename;const meta=document.createElement("span");meta.textContent=`${new Date(item.createdAt).toLocaleString("es-PE")} · ${item.count} folios`;info.append(name,meta);const actions=document.createElement("div");actions.className="history-actions";const download=document.createElement("button");download.type="button";download.className="history-download";download.textContent="Descargar otra vez";download.onclick=()=>downloadExportHtml(item.html,item.filename);const remove=document.createElement("button");remove.type="button";remove.className="history-delete";remove.textContent="Quitar";remove.onclick=()=>{localWrite(EXPORT_STORAGE_KEY,localRead(EXPORT_STORAGE_KEY,[]).filter(saved=>saved.id!==item.id));renderExportHistory();};actions.append(download,remove);card.append(icon,info,actions);root.append(card);});}
$("exportButton").onclick=exportExcel;
$("clearHistory").onclick=()=>{if(confirm("¿Vaciar el historial de exportaciones de este navegador?")){localWrite(EXPORT_STORAGE_KEY,[]);renderExportHistory();}};
loadFolios();
renderExportHistory();
