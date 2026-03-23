"""
March Madness Prediction Engine
Full-stack ensemble: Logistic Regression + Gradient Boosting + Neural Net
Generates Kaggle-ready submission for both Men's and Women's brackets
"""

import pandas as pd
import numpy as np
import re
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score
import warnings
warnings.filterwarnings('ignore')

DATA_DIR = '/mnt/project/'

def parse_seed_num(seed_str):
    nums = re.findall(r'\d+', str(seed_str))
    return int(nums[0]) if nums else 16

def load_data(gender='M'):
    d = {}
    d['teams']      = pd.read_csv(f'{DATA_DIR}{gender}Teams.csv')
    d['seasons']    = pd.read_csv(f'{DATA_DIR}{gender}Seasons.csv')
    d['seeds']      = pd.read_csv(f'{DATA_DIR}{gender}NCAATourneySeeds.csv')
    d['tourney']    = pd.read_csv(f'{DATA_DIR}{gender}NCAATourneyCompactResults.csv')
    d['regular']    = pd.read_csv(f'{DATA_DIR}{gender}RegularSeasonCompactResults.csv')
    d['submission'] = pd.read_csv(f'{DATA_DIR}SampleSubmissionStage2.csv')

    # Men's only has tourney-level detailed; Women's has full regular season detailed
    import os
    reg_detail_path  = f'{DATA_DIR}{gender}RegularSeasonDetailedResults.csv'
    tour_detail_path = f'{DATA_DIR}{gender}NCAATourneyDetailedResults.csv'
    if os.path.exists(reg_detail_path):
        d['detailed'] = pd.read_csv(reg_detail_path)
        print(f"[{gender}] Using regular season detailed results")
    else:
        d['detailed'] = pd.read_csv(tour_detail_path)
        print(f"[{gender}] No regular season detailed — using tourney detailed results")

    print(f"[{gender}] tourney={len(d['tourney'])}, regular={len(d['regular'])}, detailed={len(d['detailed'])}")
    return d

# ── ELO ──────────────────────────────────────────────────────────────────────
def compute_elo(regular_df, k=20, base=1500):
    elo_records = []
    for season, sg in regular_df.groupby('Season'):
        ratings = {}
        def get(tid): return ratings.get(tid, base)
        for _, row in sg.sort_values('DayNum').iterrows():
            w, l = row['WTeamID'], row['LTeamID']
            ew, el = get(w), get(l)
            exp_w = 1 / (1 + 10 ** ((el - ew) / 400))
            margin = row['WScore'] - row['LScore']
            k_adj = k * (1 + np.log(1 + abs(margin)) * 0.1)
            ratings[w] = ew + k_adj * (1 - exp_w)
            ratings[l] = el + k_adj * (0 - (1 - exp_w))
        for tid, rating in ratings.items():
            elo_records.append({'Season': season, 'TeamID': tid, 'Elo': rating})
    return pd.DataFrame(elo_records)

# ── ADVANCED STATS ────────────────────────────────────────────────────────────
def compute_advanced_stats(detailed_df):
    records = []
    games = []
    for _, row in detailed_df.iterrows():
        base = dict(Season=row['Season'])
        games.append({**base, 'TeamID': row['WTeamID'],
            'Pts': row['WScore'], 'OppPts': row['LScore'],
            'FGM': row['WFGM'], 'FGA': row['WFGA'],
            'FGM3': row['WFGM3'], 'FGA3': row['WFGA3'],
            'FTM': row['WFTM'], 'FTA': row['WFTA'],
            'OR': row['WOR'], 'DR': row['WDR'],
            'Ast': row['WAst'], 'TO': row['WTO'],
            'Stl': row['WStl'], 'Blk': row['WBlk'],
            'OppFGM': row['LFGM'], 'OppFGA': row['LFGA'],
            'OppOR': row['LOR'], 'OppTO': row['LTO'], 'Won': 1})
        games.append({**base, 'TeamID': row['LTeamID'],
            'Pts': row['LScore'], 'OppPts': row['WScore'],
            'FGM': row['LFGM'], 'FGA': row['LFGA'],
            'FGM3': row['LFGM3'], 'FGA3': row['LFGA3'],
            'FTM': row['LFTM'], 'FTA': row['LFTA'],
            'OR': row['LOR'], 'DR': row['LDR'],
            'Ast': row['LAst'], 'TO': row['LTO'],
            'Stl': row['LStl'], 'Blk': row['LBlk'],
            'OppFGM': row['WFGM'], 'OppFGA': row['WFGA'],
            'OppOR': row['WOR'], 'OppTO': row['WTO'], 'Won': 0})

    gdf = pd.DataFrame(games)
    for (season, team), tg in gdf.groupby(['Season', 'TeamID']):
        if len(tg) < 3: continue
        fga  = tg['FGA'].sum()
        fga3 = tg['FGA3'].sum()
        fta  = tg['FTA'].sum()
        or_  = tg['OR'].sum()
        poss     = fga + 0.44 * fta - or_ + tg['TO'].sum()
        opp_poss = tg['OppFGA'].sum() + 0.44 * fta - tg['OppOR'].sum() + tg['OppTO'].sum()
        records.append({
            'Season': season, 'TeamID': team,
            'WinPct':     tg['Won'].mean(),
            'AvgMargin':  (tg['Pts'] - tg['OppPts']).mean(),
            'OrtgProxy':  tg['Pts'].sum() / max(poss, 1) * 100,
            'DrtgProxy':  tg['OppPts'].sum() / max(opp_poss, 1) * 100,
            'NetRtg':     (tg['Pts'].sum() - tg['OppPts'].sum()) / max(poss, 1) * 100,
            'eFGPct':     (tg['FGM'].sum() + 0.5 * tg['FGM3'].sum()) / max(fga, 1),
            'TORate':     tg['TO'].sum() / max(poss, 1),
            'ORRate':     or_ / max(or_ + tg['DR'].sum(), 1),
            'FTRate':     tg['FTM'].sum() / max(fga, 1),
            'ThreePctg':  tg['FGM3'].sum() / max(fga3, 1),
            'ThreeRate':  fga3 / max(fga, 1),
            'AstRate':    tg['Ast'].sum() / max(tg['FGM'].sum(), 1),
            'StlRate':    tg['Stl'].sum() / max(opp_poss, 1),
            'BlkRate':    tg['Blk'].sum() / max(tg['OppFGA'].sum(), 1),
            'NumGames':   len(tg),
        })
    return pd.DataFrame(records)

# ── WIN RATES ─────────────────────────────────────────────────────────────────
def compute_win_rates(regular_df):
    wins   = regular_df.groupby(['Season','WTeamID']).size().reset_index(name='Wins').rename(columns={'WTeamID':'TeamID'})
    losses = regular_df.groupby(['Season','LTeamID']).size().reset_index(name='Losses').rename(columns={'LTeamID':'TeamID'})
    wl = wins.merge(losses, on=['Season','TeamID'], how='outer').fillna(0)
    wl['Games']   = wl['Wins'] + wl['Losses']
    wl['WinRate'] = wl['Wins'] / wl['Games']
    return wl

# ── FEATURE VECTOR ─────────────────────────────────────────────────────────────
STAT_COLS = ['WinPct','AvgMargin','OrtgProxy','DrtgProxy','NetRtg',
             'eFGPct','TORate','ORRate','FTRate','ThreePctg',
             'ThreeRate','AstRate','StlRate','BlkRate']

FEATURE_COLS = (
    ['SeedDiff','EloDiff'] +
    [f'{c}_diff' for c in STAT_COLS] +
    ['RS_WinRate_diff'] +
    ['Seed1','Seed2','Elo1','Elo2'] +
    [f'{c}_1' for c in ['WinPct','OrtgProxy','DrtgProxy','NetRtg']] +
    [f'{c}_2' for c in ['WinPct','OrtgProxy','DrtgProxy','NetRtg']]
)

def build_matchup_vec(season, t1, t2, seed_map, elo_df, stats_df, wr_df):
    def seed(t): return parse_seed_num(seed_map.get((season, t), 'W08'))
    def elo(t):
        r = elo_df[(elo_df['Season']==season) & (elo_df['TeamID']==t)]
        return r['Elo'].values[0] if len(r) else 1500
    def stats(t):
        r = stats_df[(stats_df['Season']==season) & (stats_df['TeamID']==t)]
        return r.iloc[0] if len(r) else None
    def wr(t):
        r = wr_df[(wr_df['Season']==season) & (wr_df['TeamID']==t)]
        return r.iloc[0] if len(r) else None

    s1, s2 = seed(t1), seed(t2)
    e1, e2 = elo(t1), elo(t2)
    st1, st2 = stats(t1), stats(t2)
    w1, w2  = wr(t1), wr(t2)

    feat = {
        'Season': season, 'Team1': t1, 'Team2': t2,
        'Seed1': s1, 'Seed2': s2, 'SeedDiff': s2 - s1,
        'Elo1': e1, 'Elo2': e2, 'EloDiff': e1 - e2,
    }
    for c in STAT_COLS:
        v1 = st1[c] if st1 is not None and c in st1.index else 0
        v2 = st2[c] if st2 is not None and c in st2.index else 0
        feat[f'{c}_1'] = v1
        feat[f'{c}_2'] = v2
        feat[f'{c}_diff'] = v1 - v2

    feat['RS_WinRate_1']    = w1['WinRate'] if w1 is not None else 0.5
    feat['RS_WinRate_2']    = w2['WinRate'] if w2 is not None else 0.5
    feat['RS_WinRate_diff'] = feat['RS_WinRate_1'] - feat['RS_WinRate_2']

    return feat

# ── TRAINING DATA ──────────────────────────────────────────────────────────────
def build_training_data(tourney_df, seeds_df, elo_df, stats_df, wr_df):
    seed_map = seeds_df.set_index(['Season','TeamID'])['Seed'].to_dict()
    rows = []
    np.random.seed(42)
    for _, row in tourney_df.iterrows():
        w, l = row['WTeamID'], row['LTeamID']
        if np.random.random() > 0.5:
            t1, t2, label = w, l, 1
        else:
            t1, t2, label = l, w, 0
        feat = build_matchup_vec(row['Season'], t1, t2, seed_map, elo_df, stats_df, wr_df)
        feat['label'] = label
        rows.append(feat)
    return pd.DataFrame(rows)

# ── TRAIN ENSEMBLE ─────────────────────────────────────────────────────────────
def train_ensemble(X_raw, y):
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X_raw)

    print("  Training Logistic Regression...")
    lr = LogisticRegression(C=0.1, max_iter=1000, random_state=42)
    lr.fit(Xs, y)
    lr_ll = -cross_val_score(lr, Xs, y, cv=5, scoring='neg_log_loss').mean()
    print(f"    CV Log Loss: {lr_ll:.4f}")

    print("  Training Gradient Boosting...")
    gbm = GradientBoostingClassifier(n_estimators=300, learning_rate=0.05,
                                      max_depth=4, subsample=0.8,
                                      min_samples_leaf=10, random_state=42)
    gbm.fit(X_raw, y)
    gbm_ll = -cross_val_score(gbm, X_raw, y, cv=5, scoring='neg_log_loss').mean()
    print(f"    CV Log Loss: {gbm_ll:.4f}")

    print("  Training Neural Network (MLP)...")
    mlp = MLPClassifier(hidden_layer_sizes=(128,64,32), activation='relu',
                         max_iter=500, learning_rate_init=0.001, alpha=0.01,
                         random_state=42, early_stopping=True, validation_fraction=0.1)
    mlp.fit(Xs, y)
    mlp_ll = -cross_val_score(mlp, Xs, y, cv=5, scoring='neg_log_loss').mean()
    print(f"    CV Log Loss: {mlp_ll:.4f}")

    # Inverse log-loss weighting
    scores = {'lr': lr_ll, 'gbm': gbm_ll, 'mlp': mlp_ll}
    total = sum(1/v for v in scores.values())
    weights = {k: (1/v)/total for k, v in scores.items()}
    print(f"  Weights → LR:{weights['lr']:.3f} GBM:{weights['gbm']:.3f} MLP:{weights['mlp']:.3f}")

    return {'lr': lr, 'gbm': gbm, 'mlp': mlp, 'scaler': scaler, 'weights': weights}

def predict_proba(models, X_raw):
    Xs = models['scaler'].transform(X_raw)
    w  = models['weights']
    p  = (w['lr']  * models['lr'].predict_proba(Xs)[:, 1] +
          w['gbm'] * models['gbm'].predict_proba(X_raw)[:, 1] +
          w['mlp'] * models['mlp'].predict_proba(Xs)[:, 1])
    return np.clip(p, 0.025, 0.975)

# ── SUBMISSION ─────────────────────────────────────────────────────────────────
def generate_submission(models, sub_df, seeds_df, elo_df, stats_df, wr_df):
    seed_map = seeds_df.set_index(['Season','TeamID'])['Seed'].to_dict()
    rows = []
    for _, row in sub_df.iterrows():
        parts = row['ID'].split('_')
        season, t1, t2 = int(parts[0]), int(parts[1]), int(parts[2])
        rows.append(build_matchup_vec(season, t1, t2, seed_map, elo_df, stats_df, wr_df))
    feat_df = pd.DataFrame(rows)
    valid = [c for c in FEATURE_COLS if c in feat_df.columns]
    X = feat_df[valid].fillna(0).values
    preds = predict_proba(models, X)
    out = sub_df.copy()
    out['Pred'] = preds
    return out

# ── MAIN ───────────────────────────────────────────────────────────────────────
def run_pipeline(gender='M'):
    print(f"\n{'='*55}")
    print(f"  {gender} BRACKET PIPELINE")
    print(f"{'='*55}")

    data = load_data(gender)

    print("\n[1/5] Elo ratings...")
    elo_df = compute_elo(data['regular'])

    print("[2/5] Advanced stats...")
    stats_df = compute_advanced_stats(data['detailed'])

    print("[3/5] Win rates...")
    wr_df = compute_win_rates(data['regular'])

    print("[4/5] Building training dataset...")
    train_df = build_training_data(data['tourney'], data['seeds'], elo_df, stats_df, wr_df)
    valid = [c for c in FEATURE_COLS if c in train_df.columns]
    X = train_df[valid].fillna(0).values
    y = train_df['label'].values
    print(f"  Samples: {len(train_df)}, Features: {len(valid)}")

    print("\n[5/5] Training ensemble...")
    models = train_ensemble(X, y)

    print("\n[→] Generating predictions...")
    submission = generate_submission(models, data['submission'], data['seeds'], elo_df, stats_df, wr_df)

    return models, submission, {'elo': elo_df, 'stats': stats_df, 'wr': wr_df,
                                 'seeds': data['seeds'], 'teams': data['teams']}

if __name__ == '__main__':
    m_models, m_sub, m_data = run_pipeline('M')
    w_models, w_sub, w_data = run_pipeline('W')

    # Split by TeamID range: M=1000-1999, W=3000-3999
    m_out = m_sub[m_sub['ID'].apply(lambda x: int(x.split('_')[1]) < 3000)]
    w_out = w_sub[w_sub['ID'].apply(lambda x: int(x.split('_')[1]) >= 3000)]

    final = pd.concat([m_out, w_out]).sort_values('ID').reset_index(drop=True)
    final.to_csv('/mnt/user-data/outputs/submission.csv', index=False)

    print(f"\n{'='*55}")
    print(f"  SUBMISSION COMPLETE")
    print(f"{'='*55}")
    print(f"  Total rows: {len(final)}")
    print(f"  Men's:      {len(m_out)}")
    print(f"  Women's:    {len(w_out)}")
    print(f"  Pred mean:  {final['Pred'].mean():.4f}")
    print(f"  Pred std:   {final['Pred'].std():.4f}")
    print(f"  High conf (>0.80): {(final['Pred'] > 0.80).sum()} matchups")
    print(f"  Toss-ups (0.45-0.55): {((final['Pred'] > 0.45) & (final['Pred'] < 0.55)).sum()} matchups")
    print(f"\n  Saved → submission.csv")

    # Preview top upset predictions (seed diff vs model prediction)
    seed_map = m_data['seeds'].set_index(['Season','TeamID'])['Seed'].to_dict()
    print("\n  Top 10 potential M upsets (lower seed favored):")
    m_out_copy = m_out.copy()
    m_out_copy['t1'] = m_out_copy['ID'].apply(lambda x: int(x.split('_')[1]))
    m_out_copy['t2'] = m_out_copy['ID'].apply(lambda x: int(x.split('_')[2]))
    m_out_copy['s1'] = m_out_copy.apply(lambda r: parse_seed_num(seed_map.get((2026, r['t1']), 'W16')), axis=1)
    m_out_copy['s2'] = m_out_copy.apply(lambda r: parse_seed_num(seed_map.get((2026, r['t2']), 'W16')), axis=1)
    teams_map = m_data['teams'].set_index('TeamID')['TeamName'].to_dict()
    m_out_copy['team1'] = m_out_copy['t1'].map(teams_map)
    m_out_copy['team2'] = m_out_copy['t2'].map(teams_map)
    # Upsets = t1 is higher seed (worse) but model favors them (pred > 0.5)
    upsets = m_out_copy[(m_out_copy['s1'] > m_out_copy['s2']) & (m_out_copy['Pred'] > 0.5)]
    upsets = upsets.sort_values('Pred', ascending=False).head(10)
    for _, r in upsets.iterrows():
        print(f"    #{r['s1']} {r['team1']} over #{r['s2']} {r['team2']}: {r['Pred']:.3f}")
