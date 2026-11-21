export function fastestLaps(rows) {
  return rows.filter(row=>row.valid!==false&&Number.isFinite(row.ms)&&row.ms>0)
    .sort((a,b)=>a.ms-b.ms).slice(0,3);
}

export function lapHistoryTable(rows, format) {
  if(!rows.length)return '<p>Nenhuma volta registrada ainda.</p>';
  const columns=rows.map(row=>[row.ms,row.sectors?.[0],row.sectors?.[1],row.sectors?.[2]]);
  const ranges=[0,1,2,3].map(i=>{
    const values=columns.map((col,j)=>rows[j].valid===false?null:col[i]).filter(x=>Number.isFinite(x)&&x>0);
    return {min:Math.min(...values),max:Math.max(...values)};
  });
  return `<div class="lap-history-wrap"><table class="lap-history-table">
    <thead><tr><th>Volta</th><th>Tempo</th><th>S1</th><th>S2</th><th>S3</th></tr></thead>
    <tbody>${rows.map((row,i)=>`<tr><th scope="row">V${row.lap??i+1}${row.ms==null?' <small>Sem tempo</small>':row.valid===false?' <small>Inválida</small>':''}</th>${columns[i].map((time,j)=>{
      const {min,max}=ranges[j];
      const mark=row.valid===false?'':time===min?'best':time===max?'worst':'';
      return `<td data-lap-mark="${mark}"${mark?` title="${mark==='best'?'Melhor':'Pior'} tempo da coluna"`:''}>${time==null?'—':format(time)}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="lap-history-key"><span data-lap-mark="best">Melhor</span><span data-lap-mark="worst">Pior</span></p>`;
}

export function pilotLapRows(history=[]) {
  return history.map((row,i)=>({...row,lap:i+1,sectors:row.splits?.map((value,j)=>value-(row.splits[j-1]??0))}));
}

export function reportLapRows(report) {
  const sectors=new Map((report.sectorHistory??[]).map(lap=>[lap.lap,lap.splits.map(s=>s.seconds*1000)]));
  const details=new Map((report.lapDetails??[]).map(lap=>[lap.lap,lap.sectors]));
  return report.lapTimes.map((time,i)=>({lap:i+1,ms:time*1000,sectors:sectors.get(i+1)??details.get(i+1)?.map(s=>s*1000)}));
}
