"""The house around the interviews: moods, deeds, gossip, off-screen life, endings, 1926."""

from __future__ import annotations

import json

from ravenswood import era, manor
from ravenswood.agent import Engine
from ravenswood.characters import CHARACTERS
from ravenswood.world import World, classify_tone, initial

CHARACTERS_IDS = list(CHARACTERS)


class ScriptedVoice:
    model = "scripted"

    def __init__(self, answers=(), unknown=None, reflection=None):
        self.answers = list(answers)
        self.unknown = unknown or []
        self.reflection = reflection
        self.calls = []

    def chat(self, messages, **opts):
        self.calls.append(messages)
        system = messages[0]["content"]
        if system.startswith("You analyse one sentence"):
            return json.dumps({"details": []})
        if system.startswith("You decide whether a person"):
            return json.dumps({"unknown": self.unknown})
        if "Reflect privately" in system:
            return json.dumps(self.reflection or {"thought": "", "intent": "stay"})
        return json.dumps({"answer": self.answers.pop(0) if self.answers else "Hm."})

    @staticmethod
    def json(text):
        return json.loads(text) if text else None

    def last_system(self):
        return [c for c in self.calls if not c[0]["content"].startswith(("You analyse", "You decide"))][-1][0]["content"]


def engine(make_engine, base_params, voice):
    e0 = make_engine()
    return Engine(e0.store, e0.emb, voice, base_params)


# ---------------------------------------------------------------- tone + mood
def test_typed_curses_threats_and_pleas_count():
    assert classify_tone("you fucking liar") == "insult"
    assert classify_tone("Tell me or I'll see you hang") == "threaten"
    assert classify_tone("please, i need your help to find who did this") == "beg"
    assert classify_tone("It's all right, take your time") == "comfort"
    assert classify_tone("Where were you at eleven?") == "calm"


def test_the_same_threat_lands_differently_by_temperament():
    w = World(initial(10.0))
    w.apply_tone("thomas", "threaten", "Talk or else", 10.1)
    w.apply_tone("vance", "threaten", "Talk or else", 10.1)
    assert w.npc("thomas")["fear"] > w.npc("vance")["fear"] + 20


def test_insults_make_a_proud_man_storm_out(make_engine, base_params):
    e = engine(make_engine, base_params, ScriptedVoice(["Damn your eyes.", "Get out.", "No.", "Leave."]))
    sid = e.new_session()
    notices = []
    for _ in range(4):
        notices += e.ask(sid, "julian", "You useless, pathetic idiot.").notices
    assert any("storms out" in n for n in notices)
    assert e.world_view(sid)["npcs"]["julian"]["status"] == "refusing"
    a = e.ask(sid, "julian", "Where were you at eleven?")
    assert a.trace["decision"]["rule"] == "refuses to speak"


def test_a_threat_is_remembered_by_its_victim(make_engine, base_params):
    e = engine(make_engine, base_params, ScriptedVoice(["Y-yes sir."]))
    sid = e.new_session()
    a = e.ask(sid, "thomas", "Tell me what you saw or I'll see you hang.", tone="threaten")
    assert "Thomas will remember that." in a.notices
    events = [m.text for m in e.store.memories(sid, "thomas") if m.kind == "event"]
    assert any("threatened me" in t for t in events)


# ---------------------------------------------------------------------- deeds
def test_striking_someone_spreads_through_the_house(make_engine, base_params):
    e = engine(make_engine, base_params, ScriptedVoice(["Ow — sir!"]))
    sid = e.new_session()
    out = e.act(sid, "thomas", "strike")
    assert out["line"] and "Thomas will remember that." in out["notices"]
    e.advance(sid, 90)  # Agnes, his confidant, hears within the hour
    e.world_view(sid)
    gossip = [m.text for m in e.store.memories(sid, "agnes") if m.kind == "gossip"]
    assert any("struck Thomas" in g for g in gossip)
    w = e.world_view(sid)
    assert w["npcs"]["agnes"]["trust"] < 30


def test_shooting_an_innocent_ends_the_game(make_engine, base_params):
    e = engine(make_engine, base_params, ScriptedVoice(["Put it down!"]))
    sid = e.new_session()
    e.act(sid, "julian", "draw")
    out = e.act(sid, "julian", "shoot")
    assert out["ended"] == "blood"
    assert e.verdict(sid, None, [])["id"] == "blood"


# ---------------------------------------------------------- moods decide
def test_a_terrified_suggestible_innocent_falsely_confesses(make_engine, base_params):
    e = engine(make_engine, base_params, ScriptedVoice(["No!", "Please!", "I did it, I did it!"] * 3))
    sid = e.new_session()
    w = World(e.store.world(sid))
    w.npc("thomas")["fear"] = 95
    e.store.put_world(sid, w.s)
    a = e.ask(sid, "thomas", "You killed him, didn't you?", tone="threaten")
    assert a.trace["decision"]["rule"] == "coerced false confession"
    assert a.kind == "lie"
    assert e.verdict(sid, "thomas", [])["id"] == "coerced"


def test_julian_cracks_and_gives_up_his_debts(make_engine, base_params):
    e = engine(make_engine, base_params, ScriptedVoice(["All right, the cellar — the IOUs!"]))
    sid = e.new_session()
    w = World(e.store.world(sid))
    w.npc("julian")["fear"] = 80
    e.store.put_world(sid, w.s)
    a = e.ask(sid, "julian", "Where were you at eleven o'clock last night? The truth, now.", tone="press")
    assert a.trace["decision"]["rule"] == "cracked under pressure"
    assert a.reveals_clue == "gambling-papers"
    assert any("cellar" in f for f in a.trace["prompt_focus"])


def test_vivian_only_confesses_to_the_evidence(make_engine, base_params):
    e = engine(make_engine, base_params, ScriptedVoice(["How dare you.", "Very well. I killed him."]))
    sid = e.new_session()
    w = World(e.store.world(sid))
    w.npc("vivian")["fear"] = 70
    e.store.put_world(sid, w.s)
    assert e.ask(sid, "vivian", "You killed him!").trace["decision"]["rule"] == "accusation"
    for c in ("burned-ledger", "crimson-thread", "muddy-prints"):
        e.note_clue(sid, c)
    w = World(e.store.world(sid))
    w.npc("vivian")["fear"] = 70
    e.store.put_world(sid, w.s)
    a = e.ask(sid, "vivian", "You killed him!")
    assert a.trace["decision"]["rule"] == "the killer broke"
    assert e.verdict(sid, "vivian", ["burned-ledger"])["id"] == "confession"


# ------------------------------------------------------- off-screen life
def test_people_walk_to_luncheon_and_sit_together():
    w = World(initial(10.0))
    w.tick(13.25)
    assert {n["area"] for n in w.s["npcs"].values()} == {"great_hall"}
    trail = w.s["npcs"]["thomas"]["trail"]
    assert all(manor.dist(a, b) == 1 for a, b in zip(trail, trail[1:]))  # tile by tile, no jumps


def test_news_travels_on_foot_and_the_killer_finds_the_witness_alone():
    w = World(initial(10.0))
    w.news(10.2, "thomas", "Thomas told the detective he saw a woman on the landing.", "revelation", True)
    w.npc("vivian")["fear"] = 60
    w.tick(11.0)
    assert w.flag("vivian_heard:thomas") is not None          # Thomas → Agnes → Julian → Vivian
    w.tick(15.0)
    assert w.npc("thomas")["status"] == "dead"
    v, th = w.npc("vivian"), w.npc("thomas")
    assert w.s["body"]["area"] == th["area"]                  # he lies where she caught him
    assert any("Thomas Bell's body" in e["text"] for e in w.s["events"])


def test_she_will_not_kill_in_front_of_the_detective():
    w = World(initial(10.0))
    w.news(10.2, "thomas", "Thomas told the detective he saw a woman on the landing.", "revelation", True)
    w.npc("vivian")["fear"] = 60
    w.tick(11.9)
    for _ in range(120):                                       # the detective shadows Thomas
        w.s["player"] = list(w.npc("thomas")["pos"])
        w.tick(w.s["minute"] / 60 + 1 / 60)
    assert w.npc("thomas")["status"] == "present"


def test_the_constable_can_save_thomas():
    w = World(initial(10.0))
    w.apply_deed("thomas", "watch", 10.1)
    w.news(10.2, "thomas", "Thomas told the detective he saw a woman on the landing.", "revelation", True)
    w.npc("vivian")["fear"] = 60
    w.tick(16.0)
    assert w.npc("thomas")["status"] == "present"


def test_cornered_killer_walks_out_of_the_front_door():
    w = World(initial(10.0))
    w.npc("vivian")["fear"] = 90
    w._after_mood("vivian", 10.0)
    w.tick(11.0)
    assert w.npc("vivian")["status"] == "fled"
    assert w.npc("vivian")["pos"] == list(manor.EXIT)
    assert w.ending("vivian", ["crimson-thread", "burned-ledger"])["id"] == "dover"
    assert w.ending("vivian", [])["id"] == "escaped"


def test_standing_in_her_way_stops_her_leaving():
    w = World(initial(10.0))
    w.npc("vivian")["fear"] = 90
    w._after_mood("vivian", 10.0)
    w.tick(10.5)                                               # she has started for the door
    for _ in range(60):                                        # the detective keeps at her side
        w.s["player"] = list(w.npc("vivian")["pos"])
        w.tick(w.s["minute"] / 60 + 1 / 60)
    assert w.npc("vivian")["status"] == "present"


def test_evidence_left_lying_around_is_tidied_away():
    w = World(initial(10.0))
    w.tick(17.0)
    assert "cold-teapot" in w.s["lost_clues"] and "gambling-papers" in w.s["lost_clues"]
    w2 = World(initial(10.0))
    w2.s["clues"] = ["cold-teapot"]
    w2.tick(17.0)
    assert "cold-teapot" not in w2.s["lost_clues"]


def test_nobody_destroys_evidence_with_the_detective_watching():
    w = World(initial(10.0))
    w.s["player"] = list(manor.spot("cellar", "detective"))   # waiting in the cellar
    w.tick(17.0)
    assert "gambling-papers" not in w.s["lost_clues"]


def test_the_bribe_and_its_endings():
    w = World(initial(10.0))
    w.s["clues"] = ["crimson-thread", "muddy-prints"]   # the net is closing
    w.tick(11.5)
    assert not w.s["offer"]                              # not before 11 a.m.
    w.tick(12.5)
    assert w.s["offer"]
    w.apply_deed("vivian", "accept_bribe", 12.6)
    assert w.ending("julian", [])["id"] == "bought"
    assert w.ending("vivian", [])["id"] == "double_cross"


def test_nobody_seeks_out_a_detective_they_distrust(make_engine, base_params):
    v = ScriptedVoice(reflection={"thought": "I must find the detective.", "intent": "seek_detective"})
    e = engine(make_engine, base_params, v)
    sid = e.new_session()
    w = World(e.store.world(sid))
    w.npc("agnes")["trust"] = 5
    w.s["reflect"] = ["agnes"]
    e.store.put_world(sid, w.s)
    e.reflect_pending(sid)
    events = [ev["text"] for ev in e.world_view(sid)["events"]]
    assert "Agnes is keeping out of your way." in events


def test_reflection_can_send_a_suspect_looking_for_you(make_engine, base_params):
    v = ScriptedVoice(["Ow!"], reflection={"thought": "I should tell the detective what I saw.",
                                           "intent": "seek_detective"})
    e = engine(make_engine, base_params, v)
    sid = e.new_session()
    w = World(e.store.world(sid))
    w.news(10.0, "thomas", "Thomas told the detective he saw a woman on the landing.", "revelation", True)
    e.store.put_world(sid, w.s)
    e.advance(sid, 90)
    e.world_view(sid)           # Agnes hears it from Thomas → she reflects
    assert e.reflect_pending(sid) >= 1
    w = e.world_view(sid)
    assert any("is looking for you" in ev["text"] for ev in w["events"])
    assert any(m.kind == "reflection" for m in e.store.memories(sid, "agnes"))


# ----------------------------------------------------------------- 1926
def test_modern_people_and_things_are_unknown():
    assert era.modern_terms("What do you think of Donald Trump?") == ["Donald Trump"]
    assert era.modern_terms("do u have an iphone or a laptop") == ["iphone", "laptop"]
    assert era.modern_terms("Did you see the robot at the theatre?") == []   # R.U.R., 1920
    assert era.modern_terms("Where were you at eleven?") == []


def test_asking_about_a_strange_word_checks_it(make_engine, base_params):
    v = ScriptedVoice(["Ra? I've no idea, dear — is it something from London?"], unknown=["ra"])
    e = engine(make_engine, base_params, v)
    sid = e.new_session()
    a = e.ask(sid, "agnes", "what is ra")
    assert a.trace["decision"]["rule"] == "unfamiliar term"
    assert "new-fangled" in v.last_system()           # Agnes's own way of meeting it


def test_each_suspect_meets_the_unknown_in_their_own_way(make_engine, base_params):
    v = ScriptedVoice(["Never heard of the fellow."] * 2)
    e = engine(make_engine, base_params, v)
    sid = e.new_session()
    e.ask(sid, "julian", "What do you think of Donald Trump?")
    assert "dry joke" in v.last_system()
    e.ask(sid, "vance", "What do you think of Donald Trump?")
    assert "define it" in v.last_system()


def test_an_anachronistic_answer_is_retried(make_engine, base_params):
    v = ScriptedVoice(["I'd look it up on the internet.", "I read the newspapers, sir."])
    e = engine(make_engine, base_params, v)
    sid = e.new_session()
    a = e.ask(sid, "thomas", "How do you keep up with the football?")
    assert a.answer == "I read the newspapers, sir."
    assert "1926" in a.trace["checks"][0]["problem"]


# ------------------------------------------------- seeing, asking, doing
def test_they_remember_who_they_saw_and_where():
    w = World(initial(10.0))
    mems = w.tick(13.5)                                         # luncheon: everyone in one room
    saw = [m for m in mems if m.kind == "saw" and m.cid == "agnes"]
    assert any("Vivian Cross in The Great Hall" in m.text for m in saw)
    # Sitting at the same table for half an hour is one memory, not thirty.
    assert sum("Vivian Cross in The Great Hall" in m.text for m in saw) == 1


def test_they_notice_the_detective_too():
    w = World(initial(10.0))
    w.s["player"] = list(w.npc("thomas")["pos"])
    w.s["player"][0] -= 1
    mems = w.tick(10 + 1 / 60)
    assert any(m.cid == "thomas" and "the detective in The Grand Foyer" in m.text for m in mems)


def test_people_potter_about_doing_different_things():
    w = World(initial(10.0))
    doings = set()
    for k in range(1, 7):
        w.tick(14.1 + k / 3)
        doings.add(w.npc("agnes")["doing"])
    assert len({d for d in doings if not d.startswith("walking")}) >= 2


def test_everyone_reflects_every_two_hours_even_on_a_quiet_day():
    w = World(initial(10.0))
    w.tick(12.1)
    assert set(w.s["reflect"]) == set(CHARACTERS_IDS)


def test_asking_agnes_to_show_you_around_and_she_does():
    from ravenswood.world import parse_request
    w = World(initial(10.0))
    req = parse_request("could you show me around the house?", "agnes")
    assert req == {"kind": "tour"} and w.complies("agnes", "tour")
    w.start_task("agnes", req, 10.0)
    said = set()
    for _ in range(60):                                         # the detective follows her about
        w.s["player"] = list(w.npc("agnes")["pos"])
        w.tick(w.s["minute"] / 60 + 1 / 60)
        if w.npc("agnes")["say"]:
            said.add(w.npc("agnes")["say"])
    assert len(said) >= 3                                       # she names room after room
    assert any("kingdom" in x or "Great Hall" in x for x in said)


def test_vivian_will_not_dance_unless_a_gun_is_on_her(make_engine, base_params):
    e = engine(make_engine, base_params, ScriptedVoice(["Certainly not.", "Put that thing — very well."]))
    sid = e.new_session()
    a = e.ask(sid, "vivian", "Would you dance with me?")
    assert a.trace["decision"]["rule"] == "request: dance (refused)"
    e.act(sid, "vivian", "draw")
    a = e.ask(sid, "vivian", "Dance. Now.")
    assert a.trace["decision"]["rule"] == "request: dance (agreed)"
    w = e.world_view(sid)
    e.advance(sid, 1)
    assert e.world_view(sid)["npcs"]["vivian"]["doing"] == "dancing"
    assert any("at gunpoint" in m.text for m in e.store.memories(sid, "vivian") if m.kind == "event")
    assert "Miss Cross will remember that." in a.notices
    del w


def test_follow_me_means_following():
    w = World(initial(10.0))
    w.start_task("thomas", {"kind": "follow"}, 10.0)
    w.s["player"] = [25, 21]                                    # the detective waits in the Great Hall
    w.tick(10.25)
    assert manor.dist(w.npc("thomas")["pos"], [25, 21]) <= 1
