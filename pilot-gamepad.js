export const GAMEPAD_BUTTONS={w:7,s:6,e:0,pause:9,zoomIn:5,zoomOut:4};
export const GAMEPAD_LABELS={w:'Acelerar',s:'Frear',e:'DRS',pause:'Pausar',zoomIn:'Aproximar câmera',zoomOut:'Afastar câmera'};

export function gamepadInput(pad,{gamepadButtons=GAMEPAD_BUTTONS,steerAxis=0,deadzone=.15}={}) {
  const axis=pad?.axes?.[steerAxis]??0;
  const steering=Math.abs(axis)<=deadzone?0:Math.sign(axis)*Math.min(1,(Math.abs(axis)-deadzone)/(1-deadzone));
  const input={a:Math.max(0,-steering),d:Math.max(0,steering)};
  for(const [action,index] of Object.entries(gamepadButtons)){
    const button=pad?.buttons?.[index];
    const value=button?Math.max(0,Math.min(1,button.value??Number(button.pressed))):0;
    input[action]=value>.03?value:0;
  }
  return input;
}

export function connectedGamepad() {
  try{return Array.from(navigator.getGamepads?.()??[]).find(pad=>pad?.connected)??null;}
  catch{return null;}
}
