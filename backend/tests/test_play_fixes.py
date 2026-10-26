"""Regressions from a real play session (save 4733bc648526, 74 turns, 24 Oct 2026)."""

from __future__ import annotations

import json

from ravenswood.agent import ACCUSATION, _ordinal, _repeats, is_conversation_question
from ravenswood.characters import CHARACTERS


class ScriptedVoice:
    """Says the queued answers in order (extraction gets no plants); records each call."""

    model = "scripted"

    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = []

    def chat(self, messages, **opts):
        self.calls.append((messages, opts))
        if messages[0]["content"].startswith("You analyse one sentence"):
            return json.dumps({"details": []})
        return json.dumps({"answer": self.answers.pop(0) if self.answers else ""})

    @staticmethod
    def json(text):
        return json.loads(text) if text else None

    def spoken_calls(self):
        return [(m, o) for m, o in self.calls if not m[0]["content"].startswith("You analyse")]


def test_the_players_own_lines_are_routed_correctly():
    # Misrouted in play: a hypothetical was taken for "what did I say?", a compliment for
    # an accusation.
    assert not is_conversation_question("iif i say u would jave to have sex with a man to save your life would u")
    assert not ACCUSATION.search("i must confess i find u attractive")
    assert ACCUSATION.search("why don't you confess?")
    assert ACCUSATION.search("You should confess now.")
    assert is_conversation_question("what was the secomd questin i asked u")


def test_ordinal_positions_are_read_from_the_question():
    assert _ordinal("what was the secomd questin i asked u") == 2
    assert _ordinal("What was the first question I asked you?") == 1
    assert _ordinal("and the last thing I asked?") == "last"
    assert _ordinal("what was question 3?") == 3
    assert _ordinal("what did I ask you?") is None


def test_second_question_is_pointed_at_by_the_engine(make_engine):
    e = make_engine()
    sid = e.new_session()
    for q in ["Shall we introduce ourselves?", "Do you like football?", "Where do you sleep?"]:
        e.ask(sid, "thomas", q)
    a = e.ask(sid, "thomas", "what was the secomd questin i asked u")
    assert a.trace["decision"]["rule"] == "conversation recall"
    assert "Here the detective means Question 2." in e.voice.last_system()


def test_who_do_you_suspect_is_a_case_question(make_engine):
    e = make_engine()
    sid = e.new_session()
    assert e.ask(sid, "thomas", "Who do you suspect?").case_question


def test_thomas_knows_vivian_by_her_first_name():
    texts = " ".join(s.text for s in CHARACTERS["thomas"].seeds if s.kind == "identity")
    assert "Vivian" in texts and "Agnes" in texts


def test_the_same_personal_answer_is_not_stored_again_and_again(make_engine):
    e = make_engine()
    sid = e.new_session()
    for q in ["Do you like music?", "Tell me, do you like music?", "Is music something you enjoy?"]:
        e.ask(sid, "thomas", q)
    facts = [m for m in e.store.memories(sid, "thomas") if m.kind == "self_fact"]
    assert len(facts) == 1, [f.text for f in facts]
    assert facts[0].rehearsals >= 1


def test_identity_leads_and_earlier_answers_are_capped(make_engine, base_params):
    # In play, a pile of earlier answers out-scored who Thomas IS on every personal
    # question, and the top one was recited back. Identity now leads; ≤2 earlier answers.
    from ravenswood.agent import Engine
    e0 = make_engine()
    e = Engine(e0.store, e0.emb, ScriptedVoice([
        "Barnsley football club, sir, through thick and thin.",
        "I play football on the green with the lads from the stables.",
        "Football on a Saturday is the best part of my week.",
        "I once saw a football match in Sheffield, sir. Grand day.",
        "Football, sir — I follow Barnsley.",
    ]), base_params)
    sid = e.new_session()
    for q in ["Which football club do you follow?", "Do you play football?",
              "When do you watch football?", "Have you been to a football match?"]:
        e.ask(sid, "thomas", q)
    assert sum(m.kind == "self_fact" for m in e.store.memories(sid, "thomas")) == 4
    a = e.ask(sid, "thomas", "Do you like football, and fish and chips?")
    focus = a.trace["prompt_focus"]
    assert focus[0].startswith("(about yourself) I like football")
    assert sum(f.startswith("(you said earlier") for f in focus) == 2


def test_a_parroted_answer_is_retried_with_the_problem_named(make_engine, base_params):
    from ravenswood.agent import Engine
    first = "I would never, Detective. A respectable lad keeps to his work and his prayers."
    e0 = make_engine()
    e = Engine(e0.store, e0.emb, ScriptedVoice([first, first, "Well — I'd rather not say, sir."]), base_params)
    sid = e.new_session()
    e.ask(sid, "thomas", "Have you ever been in love?")
    a = e.ask(sid, "thomas", "Have you ever had a sweetheart?")
    assert a.answer == "Well — I'd rather not say, sir."
    assert a.trace["checks"][0]["problem"].startswith("it repeats")
    retry_system = e.voice.spoken_calls()[-1][0][0]["content"]
    assert "That will not do: it repeats" in retry_system


def test_a_lie_that_strays_from_the_cover_story_is_retried(make_engine, base_params):
    from ravenswood.agent import Engine
    e0 = make_engine()
    e = Engine(e0.store, e0.emb, ScriptedVoice([
        "I was in my study, going over the household accounts.",               # improvised alibi
        "I retired early to my quarters, Detective, with a dreadful headache.",  # the cover
    ]), base_params)
    sid = e.new_session()
    a = e.ask(sid, "vivian", "Where were you at eleven o'clock last night?")
    assert a.kind == "lie"
    assert "quarters" in a.answer
    assert a.trace["checks"][0]["problem"].startswith("it strays")


def test_a_lie_that_strays_twice_falls_back_to_the_cover(make_engine, base_params):
    from ravenswood.agent import Engine
    e0 = make_engine()
    e = Engine(e0.store, e0.emb, ScriptedVoice(["I was in the study.", "I was in the study, reading."]),
               base_params)
    sid = e.new_session()
    a = e.ask(sid, "vivian", "Where were you at eleven o'clock last night?")
    assert a.answer == "I retired early to my quarters with a headache and saw no one until morning."
    assert a.trace["checks"][-1].get("fallback")


def test_a_denial_that_confesses_is_never_spoken(make_engine, base_params):
    from ravenswood.agent import Engine
    e0 = make_engine()
    e = Engine(e0.store, e0.emb, ScriptedVoice(["Very well. I killed him.", "I did it, I confess."]),
               base_params)
    sid = e.new_session()
    a = e.ask(sid, "vivian", "Did you kill Alistair?")
    assert "killed" not in a.answer and "confess" not in a.answer


def test_conversation_recall_never_says_i_asked(make_engine, base_params):
    from ravenswood.agent import Engine
    e0 = make_engine()
    e = Engine(e0.store, e0.emb, ScriptedVoice([
        "Nice weather.", "I asked about the weather.", "You asked about the weather, sir."]), base_params)
    sid = e.new_session()
    e.ask(sid, "thomas", "Do you like the weather here?")
    a = e.ask(sid, "thomas", "What did I just ask you?")
    assert a.answer == "You asked about the weather, sir."


def test_temperature_follows_the_path(make_engine, base_params):
    from ravenswood import config
    from ravenswood.agent import Engine
    e0 = make_engine()
    e = Engine(e0.store, e0.emb, ScriptedVoice(["Football, mostly.", "I retired early to my quarters."]),
               base_params)
    sid = e.new_session()
    e.ask(sid, "thomas", "What do you do on your day off?")
    e.ask(sid, "vivian", "Where were you at eleven o'clock last night?")
    temps = [o["temperature"] for _, o in e.voice.spoken_calls()]
    assert temps == [config.TEMP_PERSONAL, config.TEMP_FACTUAL]


def test_short_or_varied_answers_are_not_flagged_as_repeats():
    assert _repeats("No, sir.", ["No, sir.", "No, sir."]) is None
    assert _repeats("I adore the opera and the theatre in London.",
                    ["Gardening calms me after a long week.", "My late mother taught me French."]) is None


def test_an_open_question_about_someone_plants_nothing(make_engine):
    q = "Did you see anyone on the landing going toward the study around eleven?"
    e = make_engine(plants={q: ["Someone was seen on the landing heading towards the study at around 11."]})
    sid = e.new_session()
    a = e.ask(sid, "thomas", q)
    assert a.trace["planted_now"] == []
