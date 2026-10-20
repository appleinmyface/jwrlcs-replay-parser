import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import test from 'node:test';
import {BoxcarsParser,NetworkParse} from '@jwrlcs/boxcars-wasm';
import {parseReplayFiles} from '../src/parser.mjs';
import {normalizeReplay} from '../src/normalize.mjs';

const directory=process.env.REPLAY_FIXTURE_DIR;
const id='8A4F11A94D99212BF503C9A034869234';
function load(){
 const bytes=fs.readFileSync(path.join(directory,id+'.replay'));
 return {bytes,decoded:new BoxcarsParser(bytes).setNetworkParse(NetworkParse.Always).parse()};
}

// Literal expected values manually transcribed from the separate raw header,
// exact network frames, and UniqueId record. NOT independent visual labels.
test('retained explicit-OT replay reconciles raw flag, goal, scoring team, clock, and exact credited account',{skip:!directory},()=>{
 const {bytes,decoded}=load();
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'685aaca8b8f390075dba4908e155a44edfc4157a9feec5be1d3f8f0ae089a9f4');
 const updates=i=>decoded.network_frames.frames[i].updated_actors.map(u=>({...u,property:decoded.objects[u.object_id]}));
 assert.ok(updates(10260).some(u=>u.property==='TAGame.GameEvent_Soccar_TA:bOverTime'&&u.attribute.Boolean===true));
 assert.deepEqual(decoded.properties.Goals.at(-1),{frame:11494,PlayerName:'The 1st PROGRAM',PlayerTeam:0});
 assert.ok(updates(11494).some(u=>u.actor_id===10&&u.property==='Engine.TeamInfo:Score'&&u.attribute.Int===3));
 assert.ok(updates(11494).some(u=>u.actor_id===25&&u.property==='TAGame.PRI_TA:MatchGoals'&&u.attribute.Int===1));
 const identity=updates(0).find(u=>u.actor_id===25&&u.property==='Engine.PlayerReplicationInfo:UniqueId');
 const account=identity.attribute.UniqueId.remote_id.Epic;
 assert.equal(crypto.createHash('sha256').update(account).digest('hex'),'11d0befb716dda265ed6362b29c67ce2a623674b2d48e2a11e6aaeca1d18b0bc');
 assert.ok(updates(11487).some(u=>u.property==='TAGame.GameEvent_Soccar_TA:SecondsRemaining'&&u.attribute.Int===36));
 const g=parseReplayFiles([{name:id+'.replay',bytes}]).games[0];
 assert.equal(g.timing.overtime,true);assert.equal(g.timing.overtime_winner_color,'blue');
 assert.equal(g.timing.overtime_seconds,36);assert.equal(g.timing.game_clock_seconds,336);
 assert.equal(g.timing.overtime_goal.frame,11494);assert.equal(g.timing.overtime_goal.replay_seconds,434.055);
 assert.equal(g.timing.overtime_goal.credited_scorer.platform,'epic');
 assert.equal(g.timing.overtime_goal.credited_scorer.platform_user_id,account);
 assert.equal(g.players.find(p=>p.platform_user_id===account).advanced_statistics.overtime_goals,1);
 assert.equal(g.players.filter(p=>p.advanced_statistics.overtime_goals===0).length,5);
 assert.equal(g.timing.playing_duration_seconds,null);assert.equal(g.advanced_metrics.diagnostics.demolition_events_counted,3);
 assert.equal(g.advanced_metrics.metric_availability.overtime_goal_scorer.independent_reference_status,'not_compared');
});
test('retained replay mutation: removing credited counter preserves OT win and clock but withholds all player OT goals',{skip:!directory},()=>{
 const {bytes,decoded}=load();decoded.network_frames.frames[11494].updated_actors=decoded.network_frames.frames[11494].updated_actors.filter(u=>decoded.objects[u.object_id]!=='TAGame.PRI_TA:MatchGoals');
 const g=normalizeReplay({fileName:id+'.replay',bytes,decoded});
 assert.equal(g.timing.overtime,true);assert.equal(g.timing.overtime_winner_color,'blue');assert.equal(g.timing.overtime_seconds,36);
 assert.equal(g.timing.overtime_goal.credited_scorer,null);assert.ok(g.players.every(p=>p.advanced_statistics.overtime_goals===null));
 assert.equal(g.advanced_metrics.diagnostics.demolition_events_counted,3);
});
test('retained replay mutation: removing explicit OT signal cannot enable clock-only fallback',{skip:!directory},()=>{
 const {bytes,decoded}=load();for(const f of decoded.network_frames.frames)f.updated_actors=f.updated_actors.filter(u=>decoded.objects[u.object_id]!=='TAGame.GameEvent_Soccar_TA:bOverTime');
 const g=normalizeReplay({fileName:id+'.replay',bytes,decoded});
 assert.equal(g.timing.overtime,null);assert.equal(g.timing.overtime_winner_color,null);assert.equal(g.timing.overtime_goal,null);
 assert.ok(g.players.every(p=>p.advanced_statistics.overtime_goals===null));
 assert.equal(g.advanced_metrics.diagnostics.demolition_events_counted,3);
});
