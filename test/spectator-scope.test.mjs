import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeNetworkReplay } from '../src/advanced.mjs';

const objects = ['TAGame.PRI_TA','Archetypes.Car.Car_Default',
  'Engine.PlayerReplicationInfo:UniqueId','Engine.Pawn:PlayerReplicationInfo',
  'TAGame.GameEvent_TA:ReplicatedStateName','TAGame.Car_TA:ReplicatedDemolishExtended',
  'TAGame.PRI_TA:MatchDemolishes','TAGame.PRI_TA:MatchTimesDemolished'];
const update = (actor_id,object_id,attribute)=>({actor_id,object_id,attribute});
const actor = (actor_id,object_id)=>({actor_id,object_id});
const link = (id)=>({ActiveActor:{active:true,actor:id}});
const players = [
  {replay_name:'Alpha',platform:'steam',platform_user_id:'100',team_color:'blue'},
  {replay_name:'Bravo',platform:'steam',platform_user_id:'200',team_color:'orange'},
];
const frame = (time,updated_actors=[],new_actors=[],deleted_actors=[])=>({time,updated_actors,new_actors,deleted_actors});
const demo = ()=>({DemolishExtended:{
  attacker_pri:{active:true,actor:10},self_demo:{active:false,actor:-1},
  self_demolish:false,goal_explosion_owner:{active:false,actor:-1},
  attacker:{active:true,actor:20},victim:{active:true,actor:21},
}});
function fixture(){
  return {objects,names:['Active','PostGoalScored','ReplayPlayback'],properties:{},network_frames:{frames:[
    frame(0,[update(99,4,{Int:0}),
      update(10,2,{UniqueId:{remote_id:{Steam:'100'}}}),
      update(11,2,{UniqueId:{remote_id:{Steam:'200'}}}),
      update(20,3,link(10)),update(21,3,link(11))],
    [actor(10,0),actor(11,0),actor(20,1),actor(21,1)]),
    frame(1,[update(21,5,demo()),update(10,6,{Int:1}),update(11,7,{Int:1})]),
    frame(2,[],[],[21]),
    frame(3,[update(21,3,link(11))],[actor(21,1)]),
    frame(4,[update(99,4,{Int:1})]),
    frame(4.2,[update(21,5,demo()),update(10,6,{Int:2}),update(11,7,{Int:2})]),
    frame(4.3,[update(21,5,demo()),update(10,6,{Int:2}),update(11,7,{Int:2})]),
  ]}};
}

test('ordinary post-goal collision reconciles exact paired counters without adding an official event',()=>{
  const r=analyzeNetworkReplay(fixture(),players);
  assert.equal(r.advanced_metrics.metric_availability.demolitions.status,'verified');
  assert.deepEqual(r.playerResults.map(p=>[p.advanced_statistics.demolitions_inflicted,p.advanced_statistics.demolitions_taken]),[[1,0],[0,1]]);
  const d=r.advanced_metrics.diagnostics;
  assert.equal(d.demolition_events_counted,1);
  assert.equal(d.non_gameplay_demolition_updates_ignored,2);
  assert.equal(d.post_goal_counter_evidence.length,1);
  assert.equal(d.post_goal_counter_evidence[0].official_event_counted,false);
  assert.equal(d.recorded_demo_counter_scope_differences.length,2);
  assert.deepEqual(d.recorded_demo_counter_mismatches,[]);
  assert.ok(r.warnings.some(w=>w.code==='DEMOLITION_COUNTER_SCOPE_DIFFERENCE'));
});

for(const [name,mutate] of [
  ['missing paired counter',(d)=>{d.network_frames.frames[5].updated_actors.pop();}],
  ['counter arriving only on repeated update',(d)=>{d.network_frames.frames[5].updated_actors=d.network_frames.frames[5].updated_actors.slice(0,1);}],
  ['unexplained larger counter',(d)=>{d.network_frames.frames[5].updated_actors[1].attribute.Int=3;}],
  ['goal explosion',(d)=>{d.network_frames.frames[5].updated_actors[0].attribute.DemolishExtended.goal_explosion_owner.active=true;}],
  ['self demolition',(d)=>{d.network_frames.frames[5].updated_actors[0].attribute.DemolishExtended.self_demolish=true;}],
  ['wrong attacker PRI',(d)=>{d.network_frames.frames[5].updated_actors[0].attribute.DemolishExtended.attacker_pri.actor=11;}],
  ['replay playback phase',(d)=>{d.network_frames.frames[4].updated_actors[0].attribute.Int=2;}],
])test(`scope reconciliation refuses ${name}`,()=>{
  const d=fixture();mutate(d);
  const r=analyzeNetworkReplay(d,players);
  assert.equal(r.advanced_metrics.metric_availability.demolitions.status,'unavailable');
  assert.equal(r.advanced_metrics.diagnostics.post_goal_counter_evidence.length,0);
  assert.ok(r.playerResults.every(p=>p.advanced_statistics.demolitions_inflicted===null && p.advanced_statistics.demolitions_taken===null));
  assert.ok(r.warnings.some(w=>w.code==='DEMOLITION_COUNTER_MISMATCH'));
});

test('an unused unresolved unassigned header does not invalidate independently covered cars',()=>{
  const d=fixture();
  const r=analyzeNetworkReplay(d,[...players,{replay_name:'Unresolved header',platform:'unknown',platform_user_id:null,team_color:null,statistics:{score:0,goals:0,assists:0,saves:0,shots:0}}]);
  assert.equal(r.advanced_metrics.metric_availability.demolitions.status,'verified');
  assert.equal(r.playerResults[2].participation.status,'unknown');
  assert.equal(r.playerResults[2].advanced_statistics.demolitions_inflicted,null);
  assert.ok(r.warnings.some(w=>w.code==='NETWORK_PLAYER_IDENTITY_UNRESOLVED'));
});

test('a real car with unresolved identity still makes complete attribution unavailable',()=>{
  const d=fixture();
  d.network_frames.frames[0].new_actors.push(actor(12,0),actor(22,1));
  d.network_frames.frames[0].updated_actors.push(update(22,3,link(12)));
  const r=analyzeNetworkReplay(d,players);
  assert.equal(r.advanced_metrics.metric_availability.demolitions.status,'unavailable');
  assert.ok(r.playerResults.every(p=>p.advanced_statistics.demolitions_inflicted===null));
  assert.ok(r.warnings.some(w=>w.code==='NETWORK_PARTICIPANT_IDENTITY_UNRESOLVED'));
});

test('an unresolved assigned header cannot be silently classified as a spectator',()=>{
  const r=analyzeNetworkReplay(fixture(),[...players,{replay_name:'Ambiguous player',platform:'unknown',platform_user_id:null,team_color:'blue',statistics:{score:0}}]);
  assert.equal(r.advanced_metrics.metric_availability.demolitions.status,'unavailable');
});

test('PS4 header account matches PlayStation network account as an exact string without needing a car',()=>{
  const d=fixture();
  d.network_frames.frames[0].new_actors.push(actor(12,0));
  d.network_frames.frames[0].updated_actors.push(update(12,2,{UniqueId:{remote_id:{PlayStation:{online_id:'90071992547409931',name:'Unrelated name'}}}}));
  const r=analyzeNetworkReplay(d,[...players,{replay_name:'Header observer',platform:'ps4',platform_user_id:'90071992547409931',team_color:null}]);
  assert.equal(r.advanced_metrics.metric_availability.demolitions.status,'verified');
  assert.equal(r.playerResults[2].identity.platform_user_id,'90071992547409931');
  assert.equal(r.playerResults[2].participation.status,'no_car_observed');
  assert.equal(r.playerResults[2].advanced_statistics.demolitions_taken,null);
});
