import { ArrowRight, Check, Clock3, FlaskConical } from 'lucide-react'
import { EXPERIMENTS, LESSONS } from '../data/experiments'

interface LessonsViewProps {
  completed: number[]
  onToggle: (id: number) => void
  onOpenExperiment: (id: string) => void
}

export default function LessonsView({ completed, onToggle, onOpenExperiment }: LessonsViewProps) {
  const progress = Math.round(completed.length / LESSONS.length * 100)
  return (
    <main className="lessons-page">
      <section className="lessons-intro">
        <div>
          <span className="section-kicker">Курс + лаборатория</span>
          <h1>От первого провода<br />до <em>своего устройства.</em></h1>
        </div>
        <div className="course-progress-block">
          <p>Короткая теория и сразу практика на виртуальной плате. Ничего устанавливать не нужно.</p>
          <div className="course-progress-label"><span>Пройдено {completed.length} из {LESSONS.length}</span><strong>{progress}%</strong></div>
          <div className="course-progress-track" role="progressbar" aria-label="Прогресс курса" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      <section className="lesson-list" aria-label="Программа курса">
        {LESSONS.map((lesson) => {
          const experiment = EXPERIMENTS.find((item) => item.id === lesson.experiment)!
          const isComplete = completed.includes(lesson.id)
          return (
            <article className={`lesson-row ${isComplete ? 'is-complete' : ''}`} key={lesson.id}>
              <button className="lesson-check" type="button" onClick={() => onToggle(lesson.id)} aria-label={isComplete ? `Снять отметку с урока ${lesson.id}` : `Отметить урок ${lesson.id} пройденным`} aria-pressed={isComplete}>
                {isComplete ? <Check size={18} /> : <span>{String(lesson.id).padStart(2, '0')}</span>}
              </button>
              <div className="lesson-main">
                <div className="lesson-meta"><span><Clock3 size={13} />{lesson.duration}</span><span>{experiment.category}</span></div>
                <h2>{lesson.title}</h2>
                <p>{lesson.summary}</p>
                <div className="lesson-topics">{lesson.topics.map((topic) => <code key={topic}>{topic}</code>)}</div>
              </div>
              <div className="lesson-practice">
                <FlaskConical size={21} />
                <span>Практика</span>
                <strong>{experiment.name}</strong>
                <button type="button" onClick={() => onOpenExperiment(lesson.experiment)}>Открыть в лаборатории<ArrowRight size={16} /></button>
              </div>
            </article>
          )
        })}
      </section>
      <p className="storage-note">Прогресс, код и схемы сохраняются только в этом браузере.</p>
    </main>
  )
}
