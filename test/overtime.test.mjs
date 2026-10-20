import assert from 'node:assert/strict';
import test from 'node:test';
import {analyzeNetworkReplay} from '../src/advanced.mjs';
import {fixture,players,P,update,properties,active} from './fixtures/overtime-synthetic.mjs';

const parse=(options={},review=players)=>analyzeNetworkReplay(fixture(options),review);
const otGoals=r=>r.playerResults.map(p=>p.advanced_statistics.overtime_goals);

test('synthetic normal regulation terminal verifies false and participating-player zeroes',()=>{
 const r=parse({overtime:false});assert.equal(r.timing.overtime,false);assert.equal(r.timing.overtime_seconds,0);
 assert.equal(r.timing.ended_by,'regulation');assert.deepEqual(otGoals(r),[0,0,null]);
 assert.equal(r.advanced_metrics.metric_availability.overtime.status,'verified');
 assert.equal(r.playerResults[2].metric_availability.overtime_goals.status,'unavailable');
});
test('synthetic zero-second regulation goal remains regulation when explicitly documented through terminal',()=>{
 const r=parse({overtime:false,zeroSecondGoal:true});assert.equal(r.timing.overtime,false);
 assert.equal(r.timing.overtime_goal,null);assert.deepEqual(otGoals(r),[0,0,null]);
});
test('synthetic explicit overtime reconciles unique goal, scores, stable scorer, and direct clock',()=>{
 const r=parse();assert.equal(r.timing.overtime,true);assert.equal(r.timing.overtime_winner_color,'blue');
 assert.equal(r.timing.overtime_goal.credited_scorer.platform_user_id,'100');
 assert.equal(r.timing.overtime_goal.frame,130);assert.equal(r.timing.overtime_seconds,2);
 assert.deepEqual(otGoals(r),[1,0,null]);assert.equal(r.timing.playing_duration_seconds,null);
 assert.equal(r.advanced_metrics.diagnostics.overtime.overtime_goal_candidates.length,1);
});
test('synthetic first positive counter retains missing baseline and requires the corresponding goal record',()=>{
 const r=parse({firstPositiveCounter:true});assert.deepEqual(otGoals(r),[1,0,null]);
 assert.equal(r.advanced_metrics.diagnostics.overtime.credited_scorer_evidence.before,null);
 const d=fixture({firstPositiveCounter:true});d.properties.Goals.unshift({frame:1,PlayerName:'Alpha',PlayerTeam:0});
 const ambiguous=analyzeNetworkReplay(d,players);assert.equal(ambiguous.timing.overtime_winner_color,'blue');
 assert.equal(ambiguous.timing.overtime_goal.credited_scorer,null);assert.deepEqual(otGoals(ambiguous),[null,null,null]);
});
test('synthetic regulation technical pause cannot create overtime or a guessed playing duration',()=>{
 const r=parse({overtime:false,pause:'regulation'});assert.equal(r.timing.overtime,false);
 assert.equal(r.timing.playing_duration_seconds,null);assert.equal(r.timing.pause_seconds,null);
});
test('synthetic overtime technical pause preserves verified outcome/scorer and withholds unvalidated duration',()=>{
 const r=parse({pause:'overtime'});assert.equal(r.timing.overtime,true);assert.equal(r.timing.overtime_winner_color,'blue');
 assert.deepEqual(otGoals(r),[1,0,null]);assert.equal(r.timing.overtime_seconds,null);
 assert.match(r.advanced_metrics.metric_availability.overtime_seconds.reason,/PAUSE_CLOCK_VALIDATION_REQUIRED/);
});
test('synthetic frozen clock never advances by replay timestamp',()=>{
 const d=fixture({pause:'overtime'});for(const f of d.network_frames.frames)f.updated_actors=f.updated_actors.filter(u=>d.objects[u.object_id]!==P.pause);
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime_seconds,2);
 assert.equal(r.timing.overtime_goal.clock_seconds,2);assert.notEqual(r.timing.overtime_seconds,3);
});
test('synthetic missing OT flags cannot be replaced by time, zero clock, tied scores, or final winning goal',()=>{
 const r=parse({missingFlag:true});assert.equal(r.timing.overtime,null);assert.equal(r.timing.overtime_winner_color,null);
 assert.deepEqual(otGoals(r),[null,null,null]);assert.match(r.advanced_metrics.metric_availability.overtime.reason,/MISSING_OVERTIME_FLAG/);
 const d=fixture({missingFlag:true});d.network_frames.frames.at(-1).time=601;
 assert.equal(analyzeNetworkReplay(d,players).timing.overtime,null);
 const zero=parse({overtime:false,zeroSecondGoal:true,missingFlag:true});assert.equal(zero.timing.overtime,null);
});
test('synthetic winner terminal alone does not prove regulation',()=>{
 const d=fixture({overtime:false});for(const f of d.network_frames.frames)f.updated_actors=f.updated_actors.filter(u=>![P.end,P.state].includes(d.objects[u.object_id])||f.time<4);
 d.network_frames.frames.at(-1).updated_actors.push(update(99,P.winner,active(1)));
 assert.equal(analyzeNetworkReplay(d,players).timing.overtime,null);
});
test('synthetic absent, ambiguous, and delayed scorer leave team OT win known and every player count null',()=>{
 for(const option of [{missingScorer:true},{ambiguousScorer:true},{delayedScorer:true}]){
  const r=parse(option);assert.equal(r.timing.overtime,true);assert.equal(r.timing.overtime_winner_color,'blue');
  assert.equal(r.timing.overtime_goal.credited_scorer,null);assert.deepEqual(otGoals(r),[null,null,null]);
  assert.ok(r.warnings.some(w=>w.code==='OVERTIME_SCORER_UNVERIFIED'));
 }
});
test('synthetic defending-team credit/possible own goal is not assigned to a fabricated scorer',()=>{
 const d=fixture({missingScorer:true});d.network_frames.frames[130].updated_actors.push(update(11,P.goals,{Int:3}));
 d.properties.Goals[0]={...d.properties.Goals[0],PlayerName:'Bravo',PlayerTeam:1};
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime_winner_color,'blue');
 assert.equal(r.timing.overtime_goal.credited_scorer,null);assert.equal(r.timing.overtime_goal.own_goal,null);
 assert.deepEqual(otGoals(r),[null,null,null]);
});
test('synthetic identical display names never replace account-based attribution',()=>{
 const d=fixture();for(const f of d.network_frames.frames)for(const u of f.updated_actors)if(u.actor_id===11&&d.objects[u.object_id]===P.name)u.attribute.String='Alpha';
 const r=analyzeNetworkReplay(d,[players[0],{...players[1],replay_name:'Alpha'},players[2]]);
 assert.equal(r.timing.overtime_goal.credited_scorer.platform_user_id,'100');assert.deepEqual(otGoals(r),[1,0,null]);
});
test('synthetic scorer identity absent is unavailable; header name alone cannot identify it',()=>{
 const d=fixture();d.network_frames.frames[0].updated_actors=d.network_frames.frames[0].updated_actors.filter(u=>!(u.actor_id===10&&d.objects[u.object_id]===P.uid));
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime_winner_color,'blue');
 assert.equal(r.timing.overtime_goal.credited_scorer,null);assert.deepEqual(otGoals(r),[null,null,null]);
});
test('synthetic actor-ID reuse with another account cannot inherit credited identity',()=>{
 const d=fixture();d.network_frames.frames[90].deleted_actors=[10];
 d.network_frames.frames[91].new_actors=[{actor_id:10,object_id:1}];
 d.network_frames.frames[91].updated_actors=[update(10,P.uid,{UniqueId:{remote_id:{Steam:'999'}}}),update(10,P.name,{String:'Alpha'}),update(10,properties[7],active(1)),update(20,properties[8],active(10))];
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime_winner_color,'blue');
 assert.equal(r.timing.overtime_goal.credited_scorer,null);assert.deepEqual(otGoals(r),[null,null,null]);
});
test('synthetic duplicate header records and repeated replication cannot add OT goals',()=>{
 const d=fixture();d.properties.Goals.push({...d.properties.Goals[0]});
 const r=analyzeNetworkReplay(d,players);assert.deepEqual(otGoals(r),[1,0,null]);
 assert.equal(r.advanced_metrics.diagnostics.overtime.duplicate_header_goal_records_ignored,1);
});
test('synthetic explicit flag during a pause alone is not an overtime transition',()=>{
 const d=fixture({overtime:false});const f=d.network_frames.frames.at(-1);f.updated_actors=[update(99,P.pause,{Boolean:true}),update(99,P.ot,{Boolean:true})];
 assert.equal(analyzeNetworkReplay(d,players).timing.overtime,null);
});
test('synthetic live recording gap withholds OT duration without hiding a reconciled later goal',()=>{
 const d=fixture();d.network_frames.frames.splice(100,8);d.properties.NumFrames=d.network_frames.frames.length;
 // Header frame indices are recording-relative and must track this edited synthetic stream.
 d.properties.Goals[0].frame-=8;
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime,true);assert.equal(r.timing.overtime_winner_color,'blue');
 assert.deepEqual(otGoals(r),[1,0,null]);assert.equal(r.timing.overtime_seconds,null);
 assert.match(r.advanced_metrics.metric_availability.overtime_seconds.reason,/INCOMPLETE_CLOCK_COVERAGE/);
});
test('synthetic goal-boundary recording gap withholds outcome and player totals',()=>{
 const d=fixture();d.network_frames.frames.splice(120,10);d.properties.NumFrames=d.network_frames.frames.length;d.properties.Goals[0].frame-=10;
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime,true);assert.equal(r.timing.overtime_winner_color,null);
 assert.deepEqual(otGoals(r),[null,null,null]);
});
test('synthetic score/goal-record disagreement prevents a verified OT goal',()=>{
 for(const modify of [d=>d.properties.Team1Score=3,d=>d.properties.Goals=[],d=>d.properties.Goals[0].frame--]){
  const d=fixture();modify(d);const r=analyzeNetworkReplay(d,players);
  assert.equal(r.timing.overtime,true);assert.equal(r.timing.overtime_goal,null);assert.deepEqual(otGoals(r),[null,null,null]);
 }
});
test('new overtime fields and availability are explicit when network decoding is unavailable',()=>{
 const r=analyzeNetworkReplay({network_frames:null},players);
 assert.equal(r.timing.overtime_winner_color,null);assert.equal(r.timing.overtime_goal,null);
 assert.deepEqual(otGoals(r),[null,null,null]);
 for(const key of ['overtime','overtime_winner_color','overtime_goal','overtime_goal_scorer','overtime_seconds','overtime_goal_clock_seconds'])assert.equal(r.advanced_metrics.metric_availability[key].status,'unavailable');
});
test('OT analysis failure is isolated from working demolition extraction',()=>{
 const d=fixture();Object.defineProperty(d.properties,'Goals',{get(){throw new Error('synthetic OT failure');}});
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime,null);
 assert.equal(r.advanced_metrics.metric_availability.demolitions.status,'verified');
 assert.equal(r.playerResults[0].advanced_statistics.demolitions_inflicted,0);
 assert.ok(r.warnings.some(w=>w.code==='OVERTIME_ANALYSIS_FAILED'));
});
test('a replay-only true flag prevents a false regulation classification',()=>{
 const d=fixture({overtime:false});d.network_frames.frames[60].updated_actors.push(update(99,P.state,{Int:4}),update(99,P.ot,{Boolean:true}));
 d.network_frames.frames[61].updated_actors.push(update(99,P.state,{Int:1}),update(99,P.ot,{Boolean:false}));
 assert.equal(analyzeNetworkReplay(d,players).timing.overtime,null);
});
test('counter rollback in a goal frame leaves scorer unresolved',()=>{
 const d=fixture();d.network_frames.frames[130].updated_actors.push(update(10,P.goals,{Int:1}));
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime_winner_color,'blue');
 assert.equal(r.timing.overtime_goal.credited_scorer,null);assert.deepEqual(otGoals(r),[null,null,null]);
});
test('a recorded OT clock jump cannot become a verified duration',()=>{
 const d=fixture();d.network_frames.frames[126].updated_actors.find(u=>d.objects[u.object_id]===P.clock).attribute.Int=200;
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime,true);assert.equal(r.timing.overtime_winner_color,'blue');
 assert.equal(r.timing.overtime_seconds,null);assert.match(r.advanced_metrics.metric_availability.overtime_seconds.reason,/OVERTIME_CLOCK_JUMP/);
});
test('a contradictory resolvable terminal game winner blocks the OT outcome',()=>{
 const d=fixture();d.network_frames.frames.at(-1).updated_actors.push(update(99,P.winner,active(2)));
 const r=analyzeNetworkReplay(d,players);assert.equal(r.timing.overtime,true);assert.equal(r.timing.overtime_winner_color,null);
 assert.deepEqual(otGoals(r),[null,null,null]);
 assert.ok(r.advanced_metrics.diagnostics.overtime.overtime_goal_candidates[0].blockers.includes('TERMINAL_GAME_WINNER_DISAGREES'));
});
