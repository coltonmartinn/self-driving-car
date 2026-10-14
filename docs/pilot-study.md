# Running a small pilot with learner drivers

A two-to-three-week trial for a driving instructor, a driver's-ed teacher or a
group of parents. It measures whether students improve, using only tools that
are already in the app. No accounts, no data leaves anyone's device unless a
student sends their report link.

## Who and how many

- **5 to 20 learners** who have, or are about to get, a learner's permit.
- **Parental consent** for anyone under 18. A one-paragraph note is enough:
  what the trial is, that it's a free simulator, that participation is
  optional, and that the only data shared is the report link the student
  chooses to send.
- If you are at a school, check whether your school needs approval for
  student research before you start.

## Before (day 1, about 20 minutes)

1. **Permit quiz:** each student takes one full practice test in
   [Permit quiz](https://coltonmartinn.github.io/self-driving-car/quiz.html)
   (20 questions). This records their best score.
2. **Baseline drive:** each student drives the **Road test** once in
   [Driving School](https://coltonmartinn.github.io/self-driving-car/drive.html),
   without doing any lessons first.
3. Each student opens **Progress report**, then **Copy link**, and sends you
   the link. Paste the links into the
   [Class view](https://coltonmartinn.github.io/self-driving-car/class.html)
   and press **Download CSV**. This is your "before" file.

## During (1 to 2 weeks)

- Ask for **2 to 3 sessions a week, 15 to 20 minutes each**. Short, regular
  practice works better than one long session.
- Suggested order: work through the lessons in order, and use **Show me
  first** on any lesson a student fails twice.
- Students can **Watch replay** after a drive to see each mistake.
- If students are also driving for real, parents can record supervised hours
  in the [Practice log](https://coltonmartinn.github.io/self-driving-car/log.html).
  Its "practice ideas" come from the student's simulator mistakes.

## After (last day, about 20 minutes)

1. A second full permit quiz.
2. A second **Road test** drive.
3. New report links, pasted into the class view, then **Download CSV**. This
   is your "after" file.

## What to compare

| Measure | Where it comes from |
| --- | --- |
| Road test score, first vs best | CSV: "Road test best", plus the baseline drive in the first file |
| Average score, first 3 drives vs latest 3 | CSV: the two "Avg score" columns (also the class view's "score change" figure) |
| Permit quiz best | CSV: "Permit quiz best %" |
| Mistakes that keep coming up | Class view: "Teach this next" |
| Practice time | CSV: "Practice minutes" |

A short survey at the end adds a lot. For example:

1. How confident do you feel about driving on real roads? (1 to 5, asked before and after)
2. Which lesson taught you the most?
3. Was anything confusing or frustrating?
4. Would you keep using it? Why or why not?

## Reporting the results honestly

- Report the numbers you measured, with how many students took part, for
  example: "12 learners, average road test score 64 before and 88 after".
- A simulator score is not real-world driving skill. Don't claim the app
  makes anyone a safer driver; say what improved inside the app, and what
  students and instructors said about it.
- Without a comparison group, you can't tell how much of the improvement
  came from the app and how much from practice in general. If you can, have
  a second group take the same before and after tests without using the app.
- Keep student names out of anything you publish.

## Questions or problems

Open an issue on [GitHub](https://github.com/coltonmartinn/self-driving-car/issues)
with what happened and which device and browser were used.
