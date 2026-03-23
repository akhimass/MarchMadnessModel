from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel


class TeamStats(BaseModel):
    TeamID: int
    TeamName: Optional[str] = None
    Seed: Optional[float] = None

    # Four factors
    eFG_off: Optional[float] = None
    eFG_def: Optional[float] = None
    TO_rate_off: Optional[float] = None
    TO_rate_def: Optional[float] = None
    OR_rate: Optional[float] = None
    DR_rate: Optional[float] = None
    FT_rate: Optional[float] = None
    FT_rate_def: Optional[float] = None

    # Efficiency
    OffEff: Optional[float] = None
    DefEff: Optional[float] = None
    NetEff: Optional[float] = None
    Pace: Optional[float] = None

    # Advanced
    AstRate: Optional[float] = None
    BlkRate: Optional[float] = None
    StlRate: Optional[float] = None
    ThreePRate: Optional[float] = None
    ThreePARate: Optional[float] = None

    # SVI + power ratings
    SVI: Optional[float] = None
    SVI_category: Optional[str] = None
    massey_rating: Optional[float] = None
    elo: Optional[float] = None
    massey_rank: Optional[int] = None
    neteff_rank: Optional[int] = None


class MatchupModelBreakdown(BaseModel):
    decision_tree: float
    power_ratings: float
    similar_games: float
    simulation: float
    seed_difference: float
    overall: float


class InjuryImpact(BaseModel):
    adjustment: float = 0.0
    severity: str = "none"
    key_player: Optional[str] = None
    reasoning: Optional[str] = ""


class MatchupResponse(BaseModel):
    standard_prob: float
    chaos_prob: float
    model_breakdown: MatchupModelBreakdown
    team1: TeamStats
    team2: TeamStats
    # Compatibility: some UIs expect explicit `team*_stats` aliases.
    team1_stats: Optional[TeamStats] = None
    team2_stats: Optional[TeamStats] = None
    upset_alert: bool
    giant_killer_score: float
    injury1: Optional[InjuryImpact] = None
    injury2: Optional[InjuryImpact] = None
    narrative: Optional[dict] = None


class NarrativeResponse(BaseModel):
    team1_narrative: str
    team2_narrative: str
    matchup_narrative: str
    betting_narrative: Optional[str] = None


class BracketPickRequest(BaseModel):
    slot: str
    winner_team_id: int


class BracketSimulationResponse(BaseModel):
    survival: List[dict]
    championship_odds: Dict[str, float]
    # Optional: frontend-friendly derived list
    teams: Optional[List[dict]] = None


class UpsetPicksResponse(BaseModel):
    picks: List[dict]


class TeamLite(BaseModel):
    # Frontend-friendly payload (camelCase).
    teamId: int
    teamName: Optional[str] = None
    seed: Optional[float] = None
    seedStr: Optional[str] = None
    # UI region labels (e.g. "East", "South", "West", "Midwest")
    region: Optional[str] = None
    gender: Optional[str] = None


class FirstRoundMatchup(BaseModel):
    id: str
    # Slot token for the matchup in the bracket graph (e.g. "R1W1")
    slot: str
    team1: TeamLite
    team2: TeamLite
    # Probability that team1 wins (0..100)
    prob: float
    upsetFlag: bool
    gameTime: Optional[str] = None


class FirstRoundMatchupsResponse(BaseModel):
    matchupsByRegion: Dict[str, List[FirstRoundMatchup]]


class BracketRoundMatchupsRequest(BaseModel):
    # Optional stage in request body (R1..R6). If missing, server can use query param.
    stage: Optional[str] = None
    # slot -> winner_team_id
    picks: Dict[str, int] = {}


class BracketRoundMatchup(BaseModel):
    # Team-vs-team id (used by predictor fetching /api/matchup)
    id: str
    slot: str
    team1: TeamLite
    team2: TeamLite
    prob: float
    upsetFlag: bool
    gameTime: Optional[str] = None


class BracketRoundMatchupsResponse(BaseModel):
    stage: str
    matchups: List[BracketRoundMatchup]

