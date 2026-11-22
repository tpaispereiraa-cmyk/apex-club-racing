import {SETUP} from './pilot-driving.js';

const REPORTS = {
  loose:{
    label:'O carro está leve e difícil de controlar nas curvas',
    changes:{rearWing:2,frontWing:.5,antiRoll:-1},
    reply:'Vou dar mais apoio à traseira e deixar a resposta menos brusca nas curvas. O carro pode perder um pouco de velocidade nas retas e demorar mais para apontar na entrada.'
  },
  slow:{
    label:'O carro está lento nas retas',
    changes:{rearWing:-2,frontWing:-1},
    reply:'Vou tirar inclinação das asas para reduzir o arrasto e ganhar velocidade nas retas. Você vai ter menos apoio nas curvas rápidas, então talvez precise frear um pouco mais cedo.'
  },
  wide:{
    label:'Eu viro o volante e o carro abre a curva',
    changes:{frontWing:2,antiRoll:1},
    reply:'Vou dar mais apoio à frente e deixar a resposta da direção mais rápida. A traseira pode ficar mais sensível em curvas rápidas, especialmente se você virar e frear ao mesmo tempo.'
  },
  braking:{
    label:'O carro fica instável quando eu freio',
    changes:setup=>setup.brakeBias===SETUP.brakeBias.base
      ? {rearWing:1,antiRoll:-.5}
      : {brakeBias:Math.sign(SETUP.brakeBias.base-setup.brakeBias)*Math.min(2,Math.abs(SETUP.brakeBias.base-setup.brakeBias))},
    reply:setup=>setup.brakeBias===SETUP.brakeBias.base
      ? 'O balanço de freio já está no ponto mais forte. Vou buscar mais estabilidade com apoio na traseira. Você deve perder um pouco de velocidade de ponta.'
      : 'Vou aproximar o balanço de freio do ponto em que esse carro freia melhor. A resposta do pedal muda um pouco, então vale usar as primeiras curvas para se acostumar.'
  },
  grip:{
    label:'Quero mais aderência nas curvas rápidas',
    changes:{frontWing:1.5,rearWing:1.5},
    reply:'Vou aumentar o apoio das duas asas nas curvas rápidas. O carro segura mais em alta, mas o arrasto extra deve tirar velocidade nas retas.'
  },
  curbs:{
    label:'Quero uma frente mais dócil nas curvas lentas',
    changes:{antiRoll:-1.5,frontWing:-.5},
    reply:'Vou suavizar a resposta da frente para o carro apontar com menos agressividade. Você vai precisar de um pouco mais de comando nas mudanças rápidas de direção.'
  }
};

export function proposePilotSetup(setup,report) {
  const option=REPORTS[report];
  const deltas=typeof option.changes==='function'?option.changes(setup):option.changes;
  const changes=Object.entries(deltas).map(([id,delta])=>{
    const {min,max}=SETUP[id];
    const from=setup[id], to=Math.max(min,Math.min(max,from+delta));
    return {id,from,to};
  }).filter(({from,to})=>from!==to);
  const reply=typeof option.reply==='function'?option.reply(setup):option.reply;
  return {changes,reply};
}

export function addPilotEngineer(ui,{getSetup,applySetup,canApply}) {
  const dialog=document.createElement('dialog');
  dialog.id='pilot-engineer-dialog';
  dialog.className='pilot-engineer';
  dialog.setAttribute('aria-labelledby','pilot-engineer-title');
  dialog.innerHTML=`
    <div class="pilot-dialog-panel">
      <div class="pilot-dialog-head">
        <div><p class="pilot-kicker">TREINO LIVRE · GARAGEM</p><h2 id="pilot-engineer-title">Engenheiro de pista</h2></div>
        <form method="dialog"><button class="pilot-dialog-close" aria-label="Fechar engenheiro" autofocus>Fechar <span aria-hidden="true">×</span></button></form>
      </div>
      <div class="pilot-engineer-options">
        <p>O que você sentiu na pista?</p>
        <div role="group" aria-label="Feedback sobre o carro">${Object.entries(REPORTS).map(([id,option])=>`<button type="button" data-feedback="${id}" aria-pressed="false">${option.label}</button>`).join('')}</div>
      </div>
      <div class="pilot-engineer-reply" hidden>
        <p role="status"></p>
        <ul aria-label="Ajustes propostos"></ul>
        <button class="pilot-button" id="pilot-confirm-setup" type="button">Confirmar ajuste</button>
      </div>
    </div>`;
  ui.append(dialog);
  const options=dialog.querySelector('.pilot-engineer-options'), response=dialog.querySelector('.pilot-engineer-reply');
  const reply=response.querySelector('p'), list=response.querySelector('ul'), confirm=response.querySelector('button');
  let proposal=null;
  ui.querySelector('#pilot-open-engineer').addEventListener('click',()=>{
    if(!canApply())return;
    proposal=null;
    response.hidden=true;
    for(const button of options.querySelectorAll('button'))button.setAttribute('aria-pressed','false');
    dialog.showModal();
  });
  options.addEventListener('click',event=>{
    const selected=event.target.closest('[data-feedback]');
    if(!selected)return;
    proposal=proposePilotSetup(getSetup(),selected.dataset.feedback);
    const available=proposal.changes.length>0;
    response.hidden=false;
    reply.textContent=available?proposal.reply:'Esses ajustes já chegaram ao limite. Escolha outra sensação ou volte para mexer no acerto manualmente.';
    for(const button of options.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button===selected));
    list.hidden=confirm.hidden=!available;
    list.replaceChildren(...proposal.changes.map(({id,from,to})=>{
      const item=document.createElement('li');
      item.textContent=`${SETUP[id].label} · ${from} → ${to}`;
      return item;
    }));
    response.scrollIntoView({block:'nearest'});
  });
  confirm.addEventListener('click',()=>{
    if(!proposal?.changes.length)return;
    if(!canApply()){
      reply.textContent='O treino livre encerrou. O acerto foi mantido.';
      confirm.hidden=list.hidden=true;
      return;
    }
    applySetup(Object.fromEntries(proposal.changes.map(({id,to})=>[id,to])));
    dialog.close();
  });
}
