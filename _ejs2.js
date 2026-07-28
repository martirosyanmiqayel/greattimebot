const ejs = require('ejs');
const path = require('path');
const views = path.join(__dirname, 'dashboard', 'views');
const opts = { views: [views] };
const user = { id:'1', username:'test', global_name:'Test', avatar:null };
const def = {
  prefix:'!',
  moderation:{enabled:true,logChannelId:null,muteRoleId:null,dmOnPunish:true},
  automod:{enabled:false,blockedWords:['spam','badword'],blockInvites:false,blockLinks:false,maxMentions:0,punishment:'delete'},
  welcome:{enabled:false,channelId:null,message:'Привет {user}',dmMessage:null},
  goodbye:{enabled:false,channelId:null,message:'Пока {username}'},
  autorole:{enabled:false,roleIds:['111','222']},
  logging:{enabled:false,channelId:null,events:{messageDelete:true,messageEdit:true,memberJoin:true,memberLeave:true}},
  tickets:{enabled:false,categoryId:null,supportRoleId:null,panelChannelId:null,welcomeMessage:'Опишите проблему'}
};
const guild = { id:'999', name:'My Server', icon:null, owner:true };
(async()=>{
  await ejs.renderFile(path.join(views,'index.ejs'), {user}, opts); console.log('index.ejs OK');
  await ejs.renderFile(path.join(views,'dashboard.ejs'), {user, guilds:[guild]}, opts); console.log('dashboard.ejs OK');
  await ejs.renderFile(path.join(views,'guild.ejs'), {user, guild, settings:def, saved:'moderation'}, opts); console.log('guild.ejs OK');
  await ejs.renderFile(path.join(views,'index.ejs'), {user:null}, opts); console.log('index.ejs (logged-out) OK');
  console.log('ALL VIEWS RENDER OK');
})().catch(e=>{ console.error('VIEW ERROR:', e.message); process.exit(1); });
