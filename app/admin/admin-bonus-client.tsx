'use client'

import { useState, useTransition } from 'react'
import { createBonusQuestion, setBonusCorrectAnswer, deleteBonusQuestion } from '@/lib/actions/bonus'

type BonusQuestion = {
  id: string
  gameweek: number
  question: string
  options: string[]
  points: number
  correct_answer: string | null
}

export default function AdminBonusClient({
  gameweekId,
  existingQuestion
}: {
  gameweekId: number
  existingQuestion: BonusQuestion | null
}) {
  const [isPending, startTransition] = useTransition()
  const [question, setQuestion] = useState(existingQuestion?.question || '')
  const [options, setOptions] = useState<string[]>(
    existingQuestion?.options || ['', '', '']
  )
  const [points, setPoints] = useState(existingQuestion?.points || 1)
  const [correctAnswer, setCorrectAnswer] = useState(
    existingQuestion?.correct_answer || ''
  )
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options]
    newOptions[index] = value
    setOptions(newOptions)
  }

  const handleSaveQuestion = () => {
    setMessage(null)
    if (!question) return setMessage({ type: 'error', text: 'Please enter a question' })
    if (options.some(opt => !opt.trim())) return setMessage({ type: 'error', text: 'Please fill all 3 options' })

    startTransition(async () => {
      const result = await createBonusQuestion(gameweekId, question, options, points)
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Saved successfully!' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save question' })
      }
    })
  }

  const handleSetCorrectAnswer = () => {
    setMessage(null)
    if (!correctAnswer) return setMessage({ type: 'error', text: 'Please select a correct answer' })
    if (!existingQuestion) return

    startTransition(async () => {
      const result = await setBonusCorrectAnswer(existingQuestion.id, correctAnswer)
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Points awarded!' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to award points' })
      }
    })
  }

  const handleDelete = () => {
    setMessage(null)
    if (!existingQuestion) return
    if (!confirm('Are you sure you want to delete this question? This will fail if players have already answered.')) return

    startTransition(async () => {
      const result = await deleteBonusQuestion(existingQuestion.id)
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Deleted successfully!' })
        setQuestion('')
        setOptions(['', '', ''])
        setPoints(1)
        setCorrectAnswer('')
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to delete' })
      }
    })
  }

  return (
    <div className="mt-8 glass rounded-[2rem] p-6 sm:p-8 shadow-2xl border border-white/10 relative overflow-hidden transition-all duration-300">
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-white/10 dark:from-black/40 dark:to-black/10 pointer-events-none" />
      
      <div className="relative">
        <h3 className="text-xl font-heading uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          </span>
          Bonus Question
        </h3>

        {message && (
          <div className={`p-4 rounded-xl text-xs font-bold uppercase tracking-widest mb-6 border ${message.type === 'success' ? 'glass bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'glass bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'}`}>
            {message.text}
          </div>
        )}

        <div className="space-y-4 max-w-xl">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Question</label>
            <input 
              type="text" 
              className="w-full glass bg-white/40 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-900 dark:text-white placeholder:text-slate-400"
              placeholder="e.g. Will Haaland score 2+ goals this week?"
              value={question}
              onChange={e => setQuestion(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {options.map((opt, i) => (
              <div key={i}>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Option {i + 1}</label>
                <input 
                  type="text" 
                  className="w-full glass bg-white/40 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-900 dark:text-white placeholder:text-slate-400"
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  onChange={e => handleOptionChange(i, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Points Awarded</label>
            <select 
              className="w-32 glass bg-white/40 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-900 dark:text-white cursor-pointer"
              value={points}
              onChange={e => setPoints(Number(e.target.value))}
            >
              <option value={1} className="bg-slate-900 text-white">1 Point</option>
              <option value={2} className="bg-slate-900 text-white">2 Points</option>
              <option value={3} className="bg-slate-900 text-white">3 Points</option>
            </select>
          </div>

          <div className="pt-2 flex items-center gap-4">
            <button 
              onClick={handleSaveQuestion}
              disabled={isPending}
              className="relative group overflow-hidden bg-indigo-600 text-white px-6 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(79,70,229,0.4)]"
            >
              <span className="relative z-10">{existingQuestion ? 'Update Question' : 'Create Question'}</span>
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            {existingQuestion && (
              <button 
                onClick={handleDelete}
                disabled={isPending}
                className="relative group overflow-hidden bg-rose-600/10 text-rose-500 border border-rose-500/30 px-6 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-rose-500 hover:text-white"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {existingQuestion && (
          <div className="mt-10 pt-8 border-t border-slate-200/50 dark:border-white/10">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-3">
              Score Question
              {existingQuestion.correct_answer && (
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  Scored
                </span>
              )}
            </h4>
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 max-w-xl p-5 glass bg-white/40 dark:bg-black/20 border border-slate-200/50 dark:border-white/5 rounded-2xl">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Correct Answer</label>
                <select 
                  className="w-full glass bg-white/50 dark:bg-black/40 border border-slate-200/50 dark:border-white/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-900 dark:text-white cursor-pointer"
                  value={correctAnswer}
                  onChange={e => setCorrectAnswer(e.target.value)}
                >
                  <option value="" className="bg-slate-900 text-slate-400">-- Select Correct Option --</option>
                  {existingQuestion.options.map((opt, i) => (
                    <option key={i} value={opt} className="bg-slate-900 text-white">{opt}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={handleSetCorrectAnswer}
                disabled={isPending || !correctAnswer}
                className="relative group overflow-hidden bg-emerald-600 text-white px-6 py-3 rounded-xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]"
              >
                <span className="relative z-10">Award Points</span>
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
            {existingQuestion.correct_answer && (
              <p className="mt-4 text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/30 inline-block px-4 py-2 rounded-lg">
                Current correct answer is set to: <span className="text-emerald-500">{existingQuestion.correct_answer}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
