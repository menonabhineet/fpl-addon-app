'use client'

import { useState, useTransition } from 'react'
import { submitBonusPrediction } from '@/lib/actions/bonus'

type BonusQuestion = {
  id: string
  gameweek: number
  question: string
  options: string[]
  points: number
  correct_answer: string | null
}

type BonusPrediction = {
  id: string
  answer: string
  awarded_points: number
}

export default function BonusQuestionClient({
  question,
  prediction,
  isLocked
}: {
  question: BonusQuestion
  prediction: BonusPrediction | null
  isLocked: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [selectedOption, setSelectedOption] = useState(prediction?.answer || '')
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const handleSubmit = () => {
    setMessage(null)
    if (!selectedOption) return setMessage({ type: 'error', text: 'Please select an option' })
    
    startTransition(async () => {
      const result = await submitBonusPrediction(question.id, selectedOption)
      if (result.success) {
        setMessage({ type: 'success', text: result.message || 'Saved successfully!' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to submit' })
      }
    })
  }

  // Determine state
  const isFinished = !!question.correct_answer
  const isCorrect = isFinished && prediction?.answer === question.correct_answer

  return (
    <div className="w-full max-w-2xl mx-auto mt-6 mb-8">
      <div className={`relative glass rounded-[1.5rem] p-5 sm:p-6 shadow-xl border overflow-hidden transition-all duration-500 group ${
        isCorrect ? 'border-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.15)] hover:shadow-[0_0_50px_rgba(16,185,129,0.25)]' : 
        (isFinished && prediction && !isCorrect) ? 'border-rose-500/30 shadow-[0_0_40px_rgba(225,29,72,0.15)] hover:shadow-[0_0_50px_rgba(225,29,72,0.25)]' : 
        'border-indigo-500/30 shadow-[0_0_40px_rgba(79,70,229,0.15)] hover:shadow-[0_0_50px_rgba(79,70,229,0.25)]'
      }`}>
        <div className={`absolute inset-0 bg-gradient-to-br pointer-events-none transition-opacity duration-500 group-hover:opacity-80 ${
          isCorrect ? 'from-emerald-500/20 to-emerald-900/5 dark:from-emerald-400/10 dark:to-emerald-900/10' : 
          (isFinished && prediction && !isCorrect) ? 'from-rose-500/20 to-rose-900/5 dark:from-rose-400/10 dark:to-rose-900/10' : 
          'from-indigo-500/20 to-purple-500/5 dark:from-indigo-400/10 dark:to-purple-900/10'
        }`} />
        
        <div className="relative flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1 text-center sm:text-left">
            <div className={`inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest mb-3 border shadow-sm transition-colors duration-300 ${
              isCorrect ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
              (isFinished && prediction && !isCorrect) ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' :
              'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              GW{question.gameweek} Bonus
              <span className="opacity-50 mx-1">•</span>
              {question.points} {question.points === 1 ? 'Pt' : 'Pts'}
            </div>
            <h3 className="text-lg sm:text-xl font-heading text-slate-900 dark:text-white mb-4 drop-shadow-sm tracking-wide">
              {question.question}
            </h3>

            {message && (
              <div className={`p-3 rounded-xl text-xs font-bold uppercase tracking-widest mb-4 border ${message.type === 'success' ? 'glass bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'glass bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'}`}>
                {message.text}
              </div>
            )}

            {isFinished ? (
              <div className="mt-3 p-3 rounded-2xl bg-white/50 dark:bg-black/40 border border-slate-200/50 dark:border-white/10">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Correct Answer: <strong className="text-slate-900 dark:text-white">{question.correct_answer}</strong>
                </p>
                {prediction ? (
                  <p className={`text-sm font-bold mt-2 flex items-center justify-center sm:justify-start gap-2 ${
                    isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {isCorrect ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        You earned {prediction.awarded_points} points!
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        Your answer: {prediction.answer}
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                    You did not submit an answer.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                {question.options.map((opt, i) => {
                  const isSelected = selectedOption === opt
                  return (
                    <button
                      key={i}
                      onClick={() => !isLocked && setSelectedOption(opt)}
                      disabled={isLocked || isPending}
                      className={`relative px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 border ${
                        isSelected 
                          ? 'bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-500/20 scale-105' 
                          : 'bg-white/50 dark:bg-black/40 text-slate-700 dark:text-slate-300 border-slate-200/50 dark:border-white/10 hover:bg-white/80 dark:hover:bg-black/60'
                      } ${isLocked ? 'cursor-not-allowed opacity-75 hover:scale-100' : 'hover:scale-105 cursor-pointer'}`}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          
          {!isFinished && !isLocked && (
            <div className="flex-shrink-0 w-full sm:w-auto">
              <button 
                onClick={handleSubmit}
                disabled={isPending || !selectedOption || selectedOption === prediction?.answer}
                className="w-full sm:w-auto px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold uppercase tracking-widest rounded-xl transition-all duration-300 disabled:opacity-50 disabled:scale-100 hover:scale-105 shadow-xl disabled:shadow-none flex items-center justify-center gap-2"
              >
                {prediction ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    Update
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                    Submit
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
