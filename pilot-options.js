import {GAMEPAD_BUTTONS,GAMEPAD_LABELS,connectedGamepad,gamepadInput} from './pilot-gamepad.js';

const KEY='apex-pilot-preferences-v1';
const actions={w:'Acelerar',s:'Frear',a:'Virar à esquerda',d:'Virar à direita',e:'DRS',pause:'Pausar',zoomIn:'Aproximar câmera',zoomOut:'Afastar câmera'};
const defaults={w:'KeyW',s:'KeyS',a:'KeyA',d:'KeyD',e:'KeyE',pause:'Escape',zoomIn:'Equal',zoomOut:'Minus'};
const label=code=>code.replace(/^Key|^Digit/,'').replace('Arrow','Seta ').replace('Equal','+').replace('Minus','−').replace('Space','Espaço');
const limit=(value,min,max,fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;

export function addPilotOptions(ui,{onChange,paintPreview}) {
  let stored;
  try{stored=JSON.parse(localStorage.getItem(KEY));}catch{}
  const bindings={...defaults};
  const candidate=stored?.bindings;
  if(candidate&&Object.keys(defaults).every(k=>typeof candidate[k]==='string')&&new Set(Object.values(candidate)).size===8)Object.assign(bindings,candidate);
  const prefs={bindings,zoom:limit(stored?.zoom,.65,1.7,1),line:stored?.line!==false,drsZones:stored?.drsZones!==false,
    drsMode:stored?.drsMode==='toggle'?'toggle':'hold',leftHanded:!!stored?.leftHanded,touchSize:limit(stored?.touchSize,48,80,60),
    ghost:['off','self','next','leader'].includes(stored?.ghost)?stored.ghost:'off',opacity:limit(stored?.opacity,.15,.7,.35),
    touchControls:typeof stored?.touchControls==='boolean'?stored.touchControls:matchMedia('(pointer: coarse)').matches,
    gamepad:stored?.gamepad!==false,deadzone:limit(stored?.deadzone,.05,.4,.15),steerAxis:Math.round(limit(stored?.steerAxis,0,7,0)),
    gamepadButtons:{...GAMEPAD_BUTTONS}};
  if(stored?.gamepadButtons&&Object.keys(GAMEPAD_BUTTONS).every(id=>Number.isInteger(stored.gamepadButtons[id])&&stored.gamepadButtons[id]>=0&&stored.gamepadButtons[id]<64)
    &&new Set(Object.values(stored.gamepadButtons)).size===6)prefs.gamepadButtons={...stored.gamepadButtons};
  const dialog=document.createElement('dialog');
  dialog.className='pilot-engineer pilot-options';
  dialog.setAttribute('aria-labelledby','pilot-options-title');
  dialog.innerHTML=`<div class="pilot-dialog-panel"><div class="pilot-dialog-head"><h2 id="pilot-options-title">Pilotagem</h2><form method="dialog"><button class="pilot-dialog-close">Fechar</button></form></div>
    <section><h3>Câmera</h3><p>Ajuste sua visão antes de entrar na sessão.</p><canvas width="560" height="210" role="img" aria-label="Prévia da câmera"></canvas>
    <label>Zoom <input name="zoom" type="range" min=".65" max="1.7" step=".05"><output></output></label></section>
    <section><h3>Controles</h3><p>Selecione uma ação e pressione a tecla desejada.</p><div class="pilot-key-bindings">${Object.entries(actions).map(([id,name])=>`<button type="button" data-bind="${id}"><span>${name}</span><kbd></kbd></button>`).join('')}</div><p data-binding-status role="status"></p><button type="button" data-defaults>Restaurar teclas padrão</button></section>
    <section><h3>DRS e pista</h3><label>Ativação do DRS<select name="drsMode"><option value="hold">Segurar o botão</option><option value="toggle">Um toque para abrir ou armar</option></select></label><label><input name="line" type="checkbox"> Mostrar linha sugerida</label><label><input name="drsZones" type="checkbox"> Mostrar zonas de DRS</label></section>
    <section><h3>Controle Xbox e outros</h3><label><input name="gamepad" type="checkbox"> Usar controle</label><p data-gamepad-status role="status">Conecte o controle e pressione um botão.</p><p>USB ou Bluetooth. Padrão Xbox · analógico esquerdo, RT acelerar, LT frear, A para DRS e Menu para pausar. Outros modelos podem usar numeração diferente.</p><label>Zona morta<input name="deadzone" type="range" min=".05" max=".4" step=".01"></label><label>Eixo da direção<select name="steerAxis">${Array.from({length:8},(_,i)=>`<option value="${i}">Eixo ${i+1}</option>`).join('')}</select></label><div class="pilot-key-bindings">${Object.entries(GAMEPAD_LABELS).map(([id,label])=>`<button type="button" data-pad-bind="${id}"><span>${label}</span><kbd></kbd></button>`).join('')}</div><p data-pad-message role="status"></p><button type="button" data-pad-defaults>Restaurar controle padrão</button></section>
    <section><h3>Fantasma no treino e quali</h3><label>Referência<select name="ghost"><option value="off">Desligado</option><option value="self">Meu melhor tempo</option><option value="next">Piloto acima de mim</option><option value="leader">Melhor geral</option></select></label><label>Opacidade<input name="opacity" type="range" min=".15" max=".7" step=".05"></label><p>Usa a gravação disponível da sessão. A referência é carregada a cada saída.</p></section>
    <section><h3>Celular</h3><label><input name="touchControls" type="checkbox"> Mostrar controles de toque</label><label>Tamanho dos botões<input name="touchSize" type="range" min="48" max="80" step="4"></label><label><input name="leftHanded" type="checkbox"> Inverter os lados dos controles</label><p>Use o celular deitado. Arraste a direção para dosar as curvas e toque nos pedais.</p></section></div>`;
  ui.append(dialog);
  const preview=dialog.querySelector('canvas'), status=dialog.querySelector('[data-binding-status]');
  let capturing=null,padCapturing=null,previousPad=[];
  const padStatus=dialog.querySelector('[data-gamepad-status]'),padMessage=dialog.querySelector('[data-pad-message]');
  function render(){
    for(const input of dialog.querySelectorAll('input,select')){
      if(input.type==='checkbox')input.checked=prefs[input.name];else input.value=prefs[input.name];
    }
    dialog.querySelector('output').textContent=`${Math.round(prefs.zoom*100)}%`;
    for(const button of dialog.querySelectorAll('[data-bind]')){
      button.querySelector('kbd').textContent=capturing===button.dataset.bind?'Pressione…':label(prefs.bindings[button.dataset.bind]);
    }
    for(const button of dialog.querySelectorAll('[data-pad-bind]'))button.querySelector('kbd').textContent=padCapturing===button.dataset.padBind?'Pressione…':`B${prefs.gamepadButtons[button.dataset.padBind]}`;
    paintPreview(preview,prefs.zoom);
  }
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{status.textContent='Não foi possível salvar as preferências neste navegador.';}
    ui.dataset.leftHanded=String(prefs.leftHanded);
    ui.dataset.touchControls=String(prefs.touchControls);
    ui.style.setProperty('--pilot-touch-size',prefs.touchSize+'px');
    onChange(prefs);render();
  }
  dialog.addEventListener('input',event=>{
    const input=event.target;
    if(!input.name)return;
    prefs[input.name]=input.type==='checkbox'?input.checked:input.type==='range'||input.name==='steerAxis'?Number(input.value):input.value;
    save();
  });
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('[data-bind]');
    if(button){capturing=button.dataset.bind;status.textContent='Pressione a nova tecla. Escape cancela.';render();}
    if(event.target.closest('[data-defaults]')){prefs.bindings={...defaults};capturing=null;status.textContent='Teclas padrão restauradas.';save();}
    const padButton=event.target.closest('[data-pad-bind]');
    if(padButton){padCapturing=padButton.dataset.padBind;capturing=null;padMessage.textContent='Pressione o botão ou gatilho no controle.';render();}
    if(event.target.closest('[data-pad-defaults]')){prefs.gamepadButtons={...GAMEPAD_BUTTONS};prefs.steerAxis=0;padCapturing=null;save();}
  });
  dialog.addEventListener('keydown',event=>{
    if(!capturing)return;
    event.preventDefault();event.stopPropagation();
    if(event.code==='Escape'){capturing=null;render();return;}
    if(event.ctrlKey||event.altKey||event.metaKey||['ShiftLeft','ShiftRight','ControlLeft','AltLeft','MetaLeft'].includes(event.code))return;
    const conflict=Object.entries(prefs.bindings).find(([id,code])=>id!==capturing&&code===event.code);
    if(conflict){status.textContent=`Essa tecla já controla ${actions[conflict[0]].toLowerCase()}.`;return;}
    prefs.bindings[capturing]=event.code;capturing=null;status.textContent='Tecla salva.';save();
  });
  dialog.addEventListener('close',()=>{capturing=null;padCapturing=null;});
  ui.querySelector('#pilot-open-options').onclick=()=>{render();dialog.showModal();};
  const action=event=>Object.keys(prefs.bindings).find(id=>prefs.bindings[id]===event.code)
    ??({ArrowUp:'w',ArrowDown:'s',ArrowLeft:'a',ArrowRight:'d'}[event.code]);
  save();
  return {
    prefs,action,
    pollGamepad(){
      const pad=connectedGamepad();
      if(dialog.open){
        const description=pad?`Conectado · ${pad.id}`:'Conecte o controle e pressione um botão.';
        if(padStatus.textContent!==description)padStatus.textContent=description;
      }
      const down=pad?.buttons.map(b=>b.pressed||b.value>.5)??[];
      if(dialog.open&&padCapturing){
        const index=down.findIndex((pressed,i)=>pressed&&!previousPad[i]);
        if(index>=0){
          const conflict=Object.entries(prefs.gamepadButtons).find(([id,button])=>id!==padCapturing&&button===index);
          if(conflict)padMessage.textContent=`B${index} já controla ${GAMEPAD_LABELS[conflict[0]].toLowerCase()}.`;
          else {prefs.gamepadButtons[padCapturing]=index;padCapturing=null;padMessage.textContent='Botão salvo.';save();}
        }
      }
      previousPad=down;
      return !dialog.open&&prefs.gamepad?gamepadInput(pad,prefs):gamepadInput(null,prefs);
    },
    setZoom(value){prefs.zoom=limit(value,.65,1.7,1);save();}
  };
}
