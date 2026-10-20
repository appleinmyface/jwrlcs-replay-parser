// Synthetic signal tests only. These are not independently viewed replays.
export const properties = [
  'Archetypes.GameEvent.GameEvent_Soccar','TAGame.Default__PRI_TA',
  'Archetypes.Car.Car_Default','Archetypes.Teams.Team0','Archetypes.Teams.Team1',
  'Engine.PlayerReplicationInfo:PlayerName','Engine.PlayerReplicationInfo:UniqueId',
  'Engine.PlayerReplicationInfo:Team','Engine.Pawn:PlayerReplicationInfo',
  'TAGame.GameEvent_TA:ReplicatedStateName','TAGame.GameEvent_Soccar_TA:SecondsRemaining',
  'TAGame.GameEvent_Soccar_TA:bOverTime','TAGame.PRI_TA:MatchGoals','Engine.TeamInfo:Score',
  'TAGame.GameEvent_Soccar_TA:ReplicatedScoredOnTeam','TAGame.GameEvent_Soccar_TA:bMatchEnded',
  'Engine.GameReplicationInfo:bStopCountDown','TAGame.GameEvent_Team_TA:bForfeit',
  'TAGame.GameEvent_Soccar_TA:GameWinner',
];
export const id = Object.fromEntries(properties.map((p,i)=>[p,i]));
export const update = (actor,property,attribute)=>({actor_id:actor,object_id:id[property],attribute});
export const active = actor=>({ActiveActor:{active:true,actor}});
export const players = [
 {replay_name:'Alpha',platform:'steam',platform_user_id:'100',team_color:'blue'},
 {replay_name:'Bravo',platform:'steam',platform_user_id:'200',team_color:'orange'},
 {replay_name:'Observer',platform:'steam',platform_user_id:'300',team_color:null},
];
export const P = {
 state:properties[9],clock:properties[10],ot:properties[11],goals:properties[12],
 score:properties[13],scoredOn:properties[14],end:properties[15],pause:properties[16],
 forfeit:properties[17],winner:properties[18],name:properties[5],uid:properties[6],
};

export function fixture({ overtime=true, zeroSecondGoal=false, pause=null, missingFlag=false,
  missingScorer=false, ambiguousScorer=false, delayedScorer=false, firstPositiveCounter=false }={}) {
 const names=['Countdown','Active','PostGoalScored','Finished','ReplayPlayback'];
 const goalTime=overtime ? 6.5+(pause==='overtime'?1:0) : zeroSecondGoal ? 3.8 : null;
 const endTime=overtime ? goalTime+0.5 : 4+(pause==='regulation'?1:0);
 const frames=Array.from({length:Math.round(endTime*20)+1},(_,i)=>({time:i/20,new_actors:[],updated_actors:[],deleted_actors:[]}));
 const at=t=>frames[Math.round(t*20)];
 const push=(t,actor,property,attribute)=>at(t).updated_actors.push(update(actor,property,attribute));
 frames[0].new_actors=[{actor_id:99,object_id:0},{actor_id:1,object_id:3},{actor_id:2,object_id:4},
  {actor_id:10,object_id:1},{actor_id:11,object_id:1},{actor_id:12,object_id:1},
  {actor_id:20,object_id:2},{actor_id:21,object_id:2}];
 for(const [a,p,team,car] of [[10,players[0],1,20],[11,players[1],2,21],[12,players[2],null,null]]){
  push(0,a,P.name,{String:p.replay_name});push(0,a,P.uid,{UniqueId:{remote_id:{Steam:p.platform_user_id}}});
  if(team)push(0,a,properties[7],active(team));if(car)push(0,car,properties[8],active(a));
 }
 if(!firstPositiveCounter)push(0,10,P.goals,{Int:1});
 push(0,11,P.goals,{Int:2});
 const before=overtime||zeroSecondGoal?{blue:2,orange:2}:{blue:3,orange:2};
 push(0,1,P.score,{Int:before.blue});push(0,2,P.score,{Int:before.orange});
 push(0,99,P.state,{Int:0});push(0,99,P.clock,{Int:3});
 push(0.5,99,P.state,{Int:1});
 if(!missingFlag)push(0,99,P.ot,{Boolean:false});
 for(const [time,value]of [[1.5,2],[2.5,1],[3.5,0]])push(time+(pause==='regulation'&&time>2?1:0),99,P.clock,{Int:value});
 if(pause==='regulation'){push(2,99,P.pause,{Boolean:true});push(3,99,P.pause,{Boolean:false});}
 if(overtime){
  push(3.7,99,P.state,{Int:0});if(!missingFlag)push(3.7,99,P.ot,{Boolean:true});
  push(3.7,99,P.clock,{Int:0});push(4.3,99,P.state,{Int:1});
  push(5.3,99,P.clock,{Int:1});push(6.3+(pause==='overtime'?1:0),99,P.clock,{Int:2});
  if(pause==='overtime'){push(5.5,99,P.pause,{Boolean:true});push(6.5,99,P.pause,{Boolean:false});}
 }
 if(goalTime!==null){
  push(goalTime,99,P.state,{Int:2});push(goalTime,99,P.scoredOn,{Byte:1});push(goalTime,1,P.score,{Int:3});
  if(!missingScorer)push(goalTime+(delayedScorer?0.1:0),10,P.goals,{Int:firstPositiveCounter?1:2});
  if(ambiguousScorer)push(goalTime,11,P.goals,{Int:3});
  // Replicated duplicates and a replay phase may not produce another goal.
  if(!missingScorer)push(goalTime+0.2,10,P.goals,{Int:firstPositiveCounter?1:2});
  push(goalTime+0.2,99,P.scoredOn,{Byte:1});
 }
 if(!overtime){
  push(endTime,99,P.end,{Boolean:true});push(endTime,99,P.state,{Int:3});
  if(!missingFlag)push(endTime,99,P.ot,{Boolean:false});
 }
 const goals=goalTime===null?[]:[{frame:Math.round(goalTime*20),PlayerName:'Alpha',PlayerTeam:0}];
 return {objects:properties,names,properties:{Team0Score:3,Team1Score:2,NumFrames:frames.length,Goals:goals},network_frames:{frames}};
}
