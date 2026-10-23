module.exports = async function verifyYouTubeChat(rootPath) {
  const { default: React } = await import('/@fs/'+rootPath+'/node_modules/.vite/deps/react.js');
  const { default: ReactDOM } = await import('/@fs/'+rootPath+'/node_modules/.vite/deps/react-dom_client.js');
  const { default: Chat } = await import('/components/YouTubeLiveChat.tsx');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const original = { read: window.dualcast.readYouTubeChat, send: window.dualcast.sendYouTubeChat };
  let reads = 0, sends = 0, sentText;
  window.dualcast.readYouTubeChat = async () => { reads++; return { ok: true, nextPageToken: 'next', pollingIntervalMillis: 100, messages: [{ id: '1', author: 'Viewer', text: 'Hello <everyone>' }] }; };
  window.dualcast.sendYouTubeChat = async (id, text) => { if(id!=='chat-test')throw Error('Wrong chat'); sends++; sentText=text; return {ok:true}; };
  const container = document.createElement('div');document.body.append(container);
  const root = ReactDOM.createRoot(container);root.render(React.createElement(Chat,{chatId:'chat-test',account:'Test account'}));
  try {
    await wait(100);container.querySelector('button').click();await wait(150);
    if(!container.textContent.includes('Hello <everyone>')||container.querySelector('everyone'))throw Error('Chat message not rendered as plain text');
    if(sends)throw Error('Chat sent a message without operator action');
    const input=container.querySelector('textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Welcome viewers');
    input.dispatchEvent(new Event('input',{bubbles:true}));await wait(100);
    container.querySelector('button[type=submit]').click();await wait(100);
    if(sends!==1||sentText!=='Welcome viewers')throw Error('Chat Send did not deliver the composed message');
    if(container.querySelector('[role=log]').children.length!==1)throw Error('Chat duplicated paginated messages');
    const layouts=[];
    for(const width of [420,280,180]){
      container.style.width=width+'px';await wait(30);
      const form=container.querySelector('form'),inputBox=input.getBoundingClientRect(),actions=container.querySelector('.youtube-chat-actions').getBoundingClientRect();
      if(form.scrollWidth>form.clientWidth+1||inputBox.bottom>actions.top||inputBox.width>width+1)throw Error('Chat composer overflowed at '+width+'px');
      const buttons=[...container.querySelectorAll('.youtube-chat-actions button')].map(button=>button.getBoundingClientRect());
      if(width>=280&&Math.abs(buttons[0].top-buttons[1].top)>1)throw Error('Chat actions did not share a row');
      if(width===180&&buttons[1].top<buttons[0].bottom)throw Error('Narrow chat actions did not wrap');
      layouts.push({width,overflow:false,buttonsWrapped:buttons[1].top>buttons[0].top+1});
    }
    container.querySelector('button').click();await wait(30);const before=reads;await wait(250);
    if(reads!==before)throw Error('Closing chat did not cancel refresh');
    return {operatorSend:true,noAutomaticSend:true,plainText:true,paginationDeduplicated:true,closeCancelsRefresh:true,layouts};
  } finally {root.unmount();container.remove();window.dualcast.readYouTubeChat=original.read;window.dualcast.sendYouTubeChat=original.send;}
};
