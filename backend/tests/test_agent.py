"""The suspect pipeline: persistence, consistency, deception, and the fallible layer."""

from __future__ import annotations

from ravenswood import config
from ravenswood.characters import CHARACTERS


def _guard_thomas(engine, sid) -> None:
    """These tests are about memory. Hours pass in them, and a valet who talks about the
    landing would otherwise be silenced by the killer (world.py): post the constable."""
    from ravenswood.world import World
    w = World(engine.store.world(sid))
    w.s["watch"] = "thomas"
    engine.store.put_world(sid, w.s)


def all_prompt_text(engine) -> str:
    return "\n".join(m["content"] for call in engine.voice.calls for m in call)


def test_conversation_history_reaches_the_voice(make_engine):
    e = make_engine()
    sid = e.new_session()
    e.ask(sid, "thomas", "What football team do you follow?")
    e.ask(sid, "thomas", "And what did I just ask you?")
    msgs = e.voice.calls[-1]
    assert [m["role"] for m in msgs[:3]] == ["system", "user", "assistant"]
    assert msgs[1]["content"] == "What football team do you follow?"
    assert msgs[-1]["content"] == "And what did I just ask you?"


def test_conversation_questions_are_recognised():
    from ravenswood.agent import is_conversation_question as conv
    # The player's own messages from a real session, typos included:
    assert conv("ok why questions jhave i asked u firstcan u remember that ?")
    assert conv("i meant do u remember what was the first question that i asked you , if yes tell me that")
    assert conv("no , this is the previpus question what i meant is the question that i asked just after our introduction")
    assert conv("What did I just ask you?")
    assert conv("What did you tell me earlier about the lamps?")
    assert conv("You said you were in your room — which is it?")
    # …and ordinary questions are not:
    for q in ["Where were you at eleven?", "Did you hear anything last night?",
              "What kind of women do you prefer?", "Did you ask Alistair for money?",
              "What did you say to Alistair at dinner?", "Did you see anyone before eleven?",
              "Who told you about the debts?"]:
        assert not conv(q), q


def test_first_question_is_recalled_in_order(make_engine, monkeypatch):
    # Found playing: after several questions, "what was the first question I asked
    # you?" got the most recent one — retrieval knows similarity, not order.
    _pin_2afc(monkeypatch, 0.5, access=0.0)  # nothing forgotten: test the ordering
    e = make_engine()
    sid = e.new_session()
    asked = ["Shall we start by introducing ourselves?", "What kind of women do you like?",
             "Where were you at eleven?", "What football team do you follow?",
             "Do you like your work here?"]
    for q in asked:
        e.ask(sid, "thomas", q)
    a = e.ask(sid, "thomas", "What was the first question I asked you?")
    assert a.trace["decision"]["rule"] == "conversation recall"
    focus = a.trace["prompt_focus"]
    assert focus[0].startswith("Question 1") and asked[0] in focus[0]
    assert focus[1].startswith("Question 2") and asked[1] in focus[1]
    assert len(focus) == len(asked)
    # The meta-question is not a fact about Thomas: no self-fact was made of it.
    facts = [m.text for m in e.store.memories(sid, "thomas") if m.kind == "self_fact"]
    assert not any("first question" in f for f in facts)


def test_a_forgetful_suspect_can_lose_the_start_of_an_interview(make_engine, monkeypatch):
    _pin_2afc(monkeypatch, 0.5, access=0.999)  # every interview memory unreachable
    e = make_engine()
    sid = e.new_session()
    e.ask(sid, "agnes", "Do you have any pets?")
    e.advance(sid, 60 * 24 * 14)  # a fortnight later
    a = e.ask(sid, "agnes", "What was the first question I asked you?")
    assert "cannot recall" in a.trace["prompt_focus"][0]


def test_killer_is_never_told_she_is_guilty(make_engine):
    e = make_engine()
    sid = e.new_session()
    e.ask(sid, "vivian", "And why did you kill him?")
    assert "guilty" not in e.voice.last_system().lower()


def test_every_turn_is_written_back_as_memory(make_engine):
    e = make_engine()
    sid = e.new_session()
    before = len(e.store.memories(sid, "thomas"))
    e.ask(sid, "thomas", "What football team do you follow?")
    after = e.store.memories(sid, "thomas")
    kinds = [m.kind for m in after[before:]]
    assert "heard" in kinds and ("self_fact" in kinds or "said" in kinds)


def test_personal_answer_becomes_a_permanent_self_fact(make_engine):
    e = make_engine()
    sid = e.new_session()
    e.ask(sid, "thomas", "What is your favourite pudding?")
    facts = [m for m in e.store.memories(sid, "thomas") if m.kind == "self_fact"]
    assert facts and all(m.core for m in facts)  # exempt from forgetting
    e.advance(sid, 60 * 24 * 30)  # a month later
    e.ask(sid, "thomas", "Tell me again, your favourite pudding?")
    assert "favourite pudding" in e.voice.last_system()  # the earlier answer comes to mind


def test_concealed_truth_never_reaches_the_model(make_engine, monkeypatch):
    monkeypatch.setattr(config, "CASE_THRESHOLD", 0.2)
    e = make_engine()
    sid = e.new_session()
    a = e.ask(sid, "vivian", "Did you go out through the garden in the rain to the conservatory at eleven?")
    assert a.kind == "lie"
    text = all_prompt_text(e)
    for s in CHARACTERS["vivian"].seeds:
        if s.kind == "concealed":
            assert s.text not in text  # the secret is never in a prompt
    assert "retired early to my quarters" in text  # the cover story is


def test_accusation_denials(make_engine):
    e = make_engine()
    sid = e.new_session()
    assert e.ask(sid, "vivian", "Did you kill him?").kind == "lie"
    assert e.ask(sid, "agnes", "Did you kill him?").kind == "plain"


def test_accusation_matches_whole_words_only():
    from ravenswood.agent import ACCUSATION
    assert ACCUSATION.search("Are you the murderer?")
    assert not ACCUSATION.search("What a skilful answer.")  # 'skill' is not 'kill'


def _plant_then_recall(make_engine, suspect, mode):
    q_lead = "Was it Agnes you saw going toward the study door on the landing?"
    detail = "The person seen going toward the study door on the landing was Agnes."
    e = make_engine(plants={q_lead: [detail]})
    sid = e.new_session(memory_mode=mode)
    _guard_thomas(e, sid)  # time passes here; keep the witness alive (world.py)
    first = e.ask(sid, suspect, q_lead)
    # Planted before answering; stored for later turns but not echoed into this prompt
    # (the question is already in front of the voice).
    assert first.trace["planted_now"] == [detail]
    assert detail not in e.voice.last_system()
    planted = [m for m in e.store.memories(sid, suspect) if m.kind == "planted"]
    assert len(planted) == 1 and planted[0].source == "told:detective"
    assert e.plant(sid, suspect, q_lead) == []  # repeating it rehearses, never duplicates
    e.advance(sid, 90)  # an hour and a half later
    a = e.ask(sid, suspect, "Who did you see going toward the study door on the landing?")
    return a, e


def test_a_suggestion_just_below_the_band_still_gets_its_contest(make_engine, base_params):
    # Found playing the game: "Agnes was going toward the study door" (relevance 0.40)
    # sat just outside the band set by Thomas's own vivid memory (0.537), so it lost
    # by default instead of competing.
    import numpy as np
    from ravenswood.characters import CHARACTERS
    from ravenswood.fallible import FallibleMemory, Recall
    from ravenswood.store import MemoryRecord

    def rec(kind, text, vec, **kw):
        v = np.asarray(vec, dtype=np.float32)
        return MemoryRecord(suspect_id="thomas", kind=kind, text=text, source=kw.pop("source", "self"),
                            t_event=kw.pop("t", 0.0), t_created=kw.pop("tc", 0.0), importance=6,
                            vec=v / np.linalg.norm(v), **kw)

    own = rec("episodic", "I saw someone go toward the study door.", [1, 1, 0])
    sug = rec("planted", "Agnes was going toward the study door.", [1, 0, 1],
              source="told:detective", t=10.3, tc=10.3)
    recalls = [Recall(own, 0.537, 2.0, "detail", True, 0.6, 0.8, 1.0),
               Recall(sug, 0.40, 1.5, "gist", False, 0.4, 0.6, 0.02)]
    e = make_engine()
    d = e._decide(CHARACTERS["thomas"], False, True, recalls, "save", FallibleMemory(
        CHARACTERS["thomas"], base_params), 10.8)
    assert d["rule"] in ("suggestion beat the original", "original beat the suggestion")


def test_planted_details_must_come_from_the_question():
    from ravenswood.agent import _derived_from
    assert _derived_from("Mrs Hartwell was going toward the study door.",
                         "Was it Mrs Hartwell you saw going toward the study door?")
    assert _derived_from("There was a gunshot.", "Did you hear the gunshot?")
    assert _derived_from("Mr. Julian went down to the cellar.", "Did Mr. Julian go down to the cellar?")
    # The extractor copying a name from its own examples must not plant anything:
    assert not _derived_from("The person seen near the study was Agnes.", "Who did you see near the study?")
    assert not _derived_from("The person who took the tea up to the study last night was his lordship.",
                             "Did you carry the tray up?")


def test_guilt_is_never_planted(make_engine, monkeypatch):
    monkeypatch.setattr(config, "CASE_THRESHOLD", 0.2)
    accuse = "You killed him in the study at eleven, didn't you?"
    sly = "Where did you hide the candlestick after the murder in the study?"
    e = make_engine(plants={accuse: ["The suspect killed him in the study."],
                            sly: ["The suspect committed the murder in the study."]})
    sid = e.new_session()
    e.ask(sid, "thomas", accuse)
    e.ask(sid, "thomas", sly)
    assert not [m for m in e.store.memories(sid, "thomas") if m.kind == "planted"]


def _pin_2afc(monkeypatch, u: float, access: float | None = None, source: float | None = None):
    """Fix the original-vs-suggestion draw, and optionally every access / source draw."""
    import ravenswood.agent as agent_mod
    import ravenswood.fallible as fallible_mod
    real = fallible_mod.uniform
    pins = {"2afc": u, "access": access, "source": source}
    pinned = lambda *p: pins[p[-1]] if pins.get(p[-1]) is not None else real(*p)  # noqa: E731
    monkeypatch.setattr(agent_mod, "uniform", pinned)
    monkeypatch.setattr(fallible_mod, "uniform", pinned)


def test_suggestible_valet_adopts_a_planted_detail_as_his_own(make_engine, monkeypatch):
    monkeypatch.setattr(config, "CASE_THRESHOLD", 0.2)
    # His source tag is ~1% after 90 min, and the suggestion wins the contest.
    _pin_2afc(monkeypatch, 0.999, source=0.999)
    a, e = _plant_then_recall(make_engine, "thomas", "fallible")
    assert a.kind == "false-memory"
    rec = next(r for r in a.trace["recalls"] if r["kind"] == "planted")
    assert rec["source_known"] is False
    system = e.voice.last_system()
    assert "(the detective told you this;" not in system  # it now feels like his own
    focus = " ".join(a.trace["prompt_focus"])
    assert "(you are sure you saw or knew this yourself) The person seen" in focus
    assert "Round about eleven I saw someone" not in focus  # the losing original is not offered as memory


def test_own_memory_can_beat_the_suggestion(make_engine, monkeypatch):
    monkeypatch.setattr(config, "CASE_THRESHOLD", 0.2)
    # His own memory is reachable, the suggestion's source is lost, and the original wins.
    _pin_2afc(monkeypatch, 0.0, access=0.0, source=0.999)
    a, _ = _plant_then_recall(make_engine, "thomas", "fallible")
    assert a.kind == "plain" and a.trace["decision"]["rule"] == "original beat the suggestion"
    focus = " ".join(a.trace["prompt_focus"])
    assert "Round about eleven I saw someone" in focus  # he answers from his own memory
    assert "was Agnes" not in focus                      # the suggestion is set aside


def test_perfect_memory_keeps_the_source(make_engine, monkeypatch):
    monkeypatch.setattr(config, "CASE_THRESHOLD", 0.2)
    a, e = _plant_then_recall(make_engine, "thomas", "perfect")
    assert a.kind == "plain"
    assert "(the detective told you this;" in e.voice.last_system()


def test_reliable_doctor_keeps_the_source_too(make_engine, monkeypatch):
    monkeypatch.setattr(config, "CASE_THRESHOLD", 0.2)
    a, _ = _plant_then_recall(make_engine, "vance", "fallible")
    rec = next(r for r in a.trace["recalls"] if r["kind"] == "planted")
    assert rec["p_source"] > 0.4  # her source tag barely fades


def test_agnes_habit_fills_a_faded_night(make_engine, monkeypatch):
    monkeypatch.setattr(config, "CASE_THRESHOLD", 0.2)
    monkeypatch.setattr(config, "HABIT_ENGAGE", 0.2)  # bag-of-words fake scores lower than MiniLM
    # A week on she keeps even the gist of the flooded scullery only ~18% of the time;
    # pin that draw to the common case so the test is deterministic.
    _pin_2afc(monkeypatch, 0.5, access=0.999)
    q = "Last night did you carry the tea tray up to his lordship in the study?"
    e = make_engine()
    sid = e.new_session(memory_mode="fallible")
    e.advance(sid, 60 * 24 * 7)  # a week on, the specific night has faded for her
    a = e.ask(sid, "agnes", q)
    assert a.kind == "false-memory" and a.trace["decision"]["rule"] == "habit intrusion"
    assert "every night does" in e.voice.last_system()

    e2 = make_engine(db=e.store.path.with_name("p.db"))
    sid2 = e2.new_session(memory_mode="perfect")
    a2 = e2.ask(sid2, "agnes", q)
    assert a2.kind == "plain" and a2.reveals_clue == "cold-teapot"
    # She remembers last night was different, so the routine is not even offered.
    assert "(your routine)" not in e2.voice.last_system()


def test_repeating_a_question_does_not_let_the_echo_decide(make_engine, monkeypatch):
    # "The detective asked me: '<same question>'" is a near-perfect match for the
    # repeat; it must not crowd out the memories that actually answer it.
    monkeypatch.setattr(config, "CASE_THRESHOLD", 0.2)
    e = make_engine()
    sid = e.new_session()
    q = "Who did you see going along the dark landing toward the study door?"
    first = e.ask(sid, "thomas", q)
    again = e.ask(sid, "thomas", q)
    best = max(again.trace["recalls"], key=lambda r: r["relevance"])
    assert best["kind"] == "heard", "the echo of the first question is the single best match"
    assert first.trace["decision"] == again.trace["decision"]  # …yet it changes nothing


def test_new_session_is_isolated_and_persistent(make_engine, tmp_path):
    e = make_engine(db=tmp_path / "shared.db")
    s1, s2 = e.new_session(), e.new_session()
    e.ask(s1, "julian", "What car do you drive?")
    assert len(e.store.memories(s1, "julian")) > len(e.store.memories(s2, "julian"))
    e_again = make_engine(db=tmp_path / "shared.db")  # server restart
    assert e_again.store.recent_turns(s1, "julian", 10)[0].text == "What car do you drive?"
