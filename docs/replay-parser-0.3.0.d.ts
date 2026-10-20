/** `verified` is extraction validation, not an independent visual accuracy label. */
export type MetricStatus = "verified" | "unavailable" | "unsupported";

export interface ParserWarning {
  code: string;
  severity: "warning";
  message: string;
  [detail: string]: unknown;
}

export interface MetricAvailability {
  status: MetricStatus;
  source: string | null;
  metric_version: string;
  reason?: string | null;
  warnings?: string[];
  validation_scope?: "extraction_and_attribution" | "explicit_signal_and_reconciled_game_records";
  independent_reference_status?: "not_compared";
  definition?: string;
}

export interface TimingMetricAvailability {
  overtime: MetricAvailability;
  overtime_seconds: MetricAvailability;
  /** Added by jwrlcs-overtime-v1; optional when consuming older 0.3.0 results. */
  overtime_winner_color?: MetricAvailability;
  overtime_goal?: MetricAvailability;
  overtime_goal_scorer?: MetricAvailability;
  overtime_goal_clock_seconds?: MetricAvailability;
  regulation_clock_seconds: MetricAvailability;
  game_clock_seconds: MetricAvailability;
  playing_duration_seconds: MetricAvailability;
  zero_second_play_seconds: MetricAvailability;
  pause_seconds: MetricAvailability;
  ended_by: MetricAvailability;
  /** Backward-compatible alias for overtime_seconds availability. */
  overtime_clock_duration: MetricAvailability;
  /** Backward-compatible alias for playing_duration_seconds availability. */
  playing_duration: MetricAvailability;
}

export interface ReplayPlayer {
  replay_name: string;
  platform: string;
  platform_user_id: string | null;
  /** Null for unassigned/observer header rows; never force Team=-1 to orange. */
  team_color: "blue" | "orange" | null;
  participation: {
    header_team_index: number | null;
    status: "car_observed" | "no_car_observed" | "unknown";
    team_assignment_observed: boolean | null;
    network_pri_generations: number | null;
    car_actor_generations: number | null;
  };
  mapped_player_id: string | null;
  identity_status: "stable_id_available" | "manual_mapping_required";
  identity_source: "header" | "network_unique_id" | null;
  statistics: {
    score: number;
    goals: number;
    assists: number;
    saves: number;
    shots: number;
  };
  advanced_statistics: {
    /** Nonnegative unique Active-phase event count; null when unavailable. */
    demolitions_inflicted: number | null;
    /** Event-derived zero is distinct from absent recorded counter evidence. */
    demolitions_taken: number | null;
    /** Added by jwrlcs-overtime-v1. Missing/unknown is never coerced to zero. */
    overtime_goals?: number | null;
    is_mvp: boolean | null;
    boost: {
      amount_collected: number | null;
      amount_consumed: number | null;
      amount_stolen: number | null;
      large_pads_collected: number | null;
      small_pads_collected: number | null;
      average_level: number | null;
      seconds_empty: number | null;
    };
    movement: {
      average_speed_uu_per_second: number | null;
      seconds_supersonic: number | null;
      seconds_ground: number | null;
      seconds_air: number | null;
      powerslide_count: number | null;
      powerslide_seconds: number | null;
    };
    positioning: {
      seconds_defensive_half: number | null;
      seconds_offensive_half: number | null;
      average_distance_to_ball_uu: number | null;
      average_distance_to_teammates_uu: number | null;
      possession_seconds: number | null;
    };
    events: {
      touches: number | null;
      clears: number | null;
      centers: number | null;
      epic_saves: number | null;
      aerial_hits: number | null;
      passes: number | null;
      interceptions: number | null;
      bumps_inflicted: number | null;
      bumps_taken: number | null;
      kickoff_wins: number | null;
      kickoff_losses: number | null;
      challenges_won: number | null;
      challenges_lost: number | null;
    };
  };
  metric_availability: {
    mvp: MetricAvailability;
    demolitions: MetricAvailability;
    overtime_goals?: MetricAvailability;
  };
}

export interface OvertimeGoal {
  /** Zero-based index in decoded.network_frames.frames. */
  frame: number;
  /** Replay timestamp in seconds, rounded to 0.001; not elapsed game time. */
  replay_seconds: number;
  /** Direct integer game-clock sample near the goal; not a physical duration. */
  clock_seconds: number | null;
  scoring_team_color: "blue" | "orange";
  score_before: { blue: number; orange: number };
  score_after: { blue: number; orange: number };
  credited_scorer: { platform: string; platform_user_id: string; replay_name: string } | null;
  /** Physical own-goal classification is not validated by this implementation. */
  own_goal: null;
  attribution_status: "credited_player" | "unresolved";
}

export interface OvertimeDiagnostics {
  metric_version: "jwrlcs-overtime-v1";
  implicit_fallback_enabled: false;
  independent_reference_status: "not_compared";
  full_decoded_recording: boolean;
  explicit_overtime_signals: Array<{ frame: number; replay_seconds: number; value: boolean; actor_key: string; phase: string | null }>;
  phase_transitions: Array<{ frame: number; replay_seconds: number; before: string | null; after: string | null }>;
  pause_signals: Array<{ frame: number; replay_seconds: number; value: boolean; phase: string | null }>;
  recording_gaps: Array<{ before_frame: number; after_frame: number; start_replay_seconds: number; end_replay_seconds: number; phase_before: string | null; phase_after: string | null }>;
  clock_samples: Array<{ frame: number; replay_seconds: number; value: number; overtime_flag: boolean | null; phase: string | null; paused: boolean }>;
  terminal_signals: Array<Record<string, unknown>>;
  team_score_changes: Array<Record<string, unknown>>;
  goal_counter_changes: Array<Record<string, unknown>>;
  header_goal_records: Array<Record<string, unknown>>;
  overtime_goal_candidates: Array<Record<string, unknown>>;
  credited_scorer_evidence: Record<string, unknown> | null;
  duplicate_header_goal_records_ignored: number;
  changed_identity_pri_keys: string[];
  player_overtime_goals_verified: number;
}

export interface ParsedReplayGame {
  game_number: number;
  parser_version: "0.3.0";
  replay_hash_sha256: string;
  replay_id: string | null;
  source_file_name: string;
  replay_name: string | null;
  sequence_hint: number | null;
  played_at_local: string | null;
  played_at_raw: string | null;
  map_code: string | null;
  match_type: string | null;
  team_size: number | null;
  team_mapping: {
    blue_season_team_id: string | null;
    orange_season_team_id: string | null;
  };
  final_score: { blue: number; orange: number };
  winner_color: "blue" | "orange" | null;
  replay_format: {
    major_version: number | null;
    minor_version: number | null;
    net_version: number | null;
    game_type: string | null;
    game_version: number | null;
    build_version: string | null;
    replay_version: number | null;
  };
  timing: {
    overtime: boolean | null;
    overtime_seconds: number | null;
    /** New fields are always emitted by v1, optional here for older 0.3.0 responses. */
    overtime_winner_color?: "blue" | "orange" | null;
    overtime_goal?: OvertimeGoal | null;
    regulation_clock_seconds: number | null;
    game_clock_seconds: number | null;
    playing_duration_seconds: number | null;
    zero_second_play_seconds: number | null;
    pause_seconds: number | null;
    ended_by: "regulation" | "regulation_clock_expired" | "overtime_goal" | "forfeit" | "incomplete" | "unknown";
    clock_precision_seconds: 1;
    playing_duration_precision_seconds: 0.001;
    metric_version: "jwrlcs-timing-v2" | "jwrlcs-timing-v3";
  };
  advanced_metrics: {
    schema_version: "1.0.0";
    /** Summary for this game only. Read each metric's status even when partial. */
    validation_status: "verified" | "partial" | "unavailable";
    network_decode_status: "success" | "unavailable";
    metric_availability: TimingMetricAvailability & Record<string, MetricAvailability>;
    diagnostics: {
      demolition_events_counted: number | null;
      demolition_events_detected: number;
      recorded_demo_counter_mismatches: Array<{
        replay_player_name: string;
        metric: "demolitions_inflicted" | "demolitions_taken";
        recorded_counter: number;
        attributed_gameplay_events: number;
      }>;
      /** Added by jwrlcs-demolitions-v3; excluded collisions, never official demos. */
      recorded_demo_counter_scope_differences?: Array<{
        replay_player_name: string;
        metric: "demolitions_inflicted" | "demolitions_taken";
        recorded_counter: number;
        attributed_gameplay_events: number;
        corroborated_post_goal_events: number;
      }>;
      post_goal_counter_evidence?: Array<{
        replay_seconds: number;
        phase: "PostGoalScored";
        attacker_player_name: string;
        victim_player_name: string;
        attacker_pri_key: string;
        victim_pri_key: string;
        attacker_car_key: string;
        victim_car_key: string;
        inflicted_counter: number;
        taken_counter: number;
        official_event_counted: false;
      }>;
      repeated_demolition_updates_ignored: number;
      non_gameplay_demolition_updates_ignored: number;
      unresolved_demolition_events: number;
      player_identities_resolved: number;
      player_identities_expected: number;
      timing: {
        reached_zero: boolean;
        overtime_attribute_observed: boolean;
        pause_signal_observed: boolean;
        terminal_boundary_observed: boolean;
        last_frame_time: number | null;
        clock_samples: number;
        game_states: string[];
        active_state_interval_seconds: number;
        active_intervals: Array<{
          start_time: number;
          end_time: number;
          interval_seconds: number;
          start_clock: number | null;
          end_clock: number | null;
          first_ball_hit_time: number | null;
          before_first_touch_seconds: number | null;
        }>;
        zero_clock_transition_interval_seconds: number | null;
        stop_countdown_signal_interval_seconds: number | null;
        diagnostic_only: true;
      };
      /** Private audit evidence; never include in public snapshots. */
      overtime?: OvertimeDiagnostics | null;
    } | null;
  };
  players: ReplayPlayer[];
  warnings: ParserWarning[];
  review_status: "needs_review";
}

export interface ParsedReplaySeries {
  contract_version: "0.3.0";
  parser_engine: {
    name: "@jwrlcs/boxcars-wasm";
    version: "0.1.0";
    rust_boxcars_version: "0.12.0";
    metric_version: "jwrlcs-scouting-v1";
    per_game_validation: true;
  };
  review_status: "needs_review";
  game_count: number;
  provisional_color_score: { blue_wins: number; orange_wins: number };
  series_warnings: ParserWarning[];
  required_review: {
    scheduled_match_id: string | null;
    confirm_team_mapping_for_every_game: true;
    /** Unresolved rows across games; names alone are never deduplicated. */
    unresolved_player_count: number;
  };
  games: ParsedReplayGame[];
}
