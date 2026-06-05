// components/forms/prediction-form.tsx
'use client'

import { useActionState } from 'react'
import { submitScorePrediction } from '@/lib/actions/score-predictions'

// Define an initial state for the form
const initialState = {
  success: false,
  message: '',
  error: ''
}

export default function PredictionForm() {
  // useActionState binds our server action and safely tracks its returning object
  const [state, formAction, isPending] = useActionState(
    async (prevState: any, formData: FormData) => {
      const result = await submitScorePrediction(formData)
      if (result.success) {
        return { success: true, message: result.message || 'Saved!', error: '' }
      } else {
        return { success: false, message: '', error: result.error || 'An error occurred' }
      }
    },
    initialState
  )

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold">Submit Score Prediction</h2>
      
      <form action={formAction} className="flex flex-col gap-4 max-w-sm">
        <div>
          <label className="block text-sm font-medium text-slate-700">Fixture ID</label>
          <input 
            type="number" 
            name="fixtureId" 
            required 
            className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
            placeholder="e.g., 1" 
          />
        </div>
        
        <div className="flex gap-4">
          <div className="w-1/2">
            <label className="block text-sm font-medium text-slate-700">Home Goals</label>
            <input 
              type="number" 
              name="homeScore" 
              required 
              className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
            />
          </div>
          <div className="w-1/2">
            <label className="block text-sm font-medium text-slate-700">Away Goals</label>
            <input 
              type="number" 
              name="awayScore" 
              required 
              className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-slate-900 shadow-sm focus:border-blue-500 focus:ring-blue-500" 
            />
          </div>
        </div>

        <button 
          type="submit" 
          disabled={isPending}
          className="mt-2 w-full rounded-md bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-500 disabled:bg-slate-400 transition-colors"
        >
          {isPending ? 'Submitting...' : 'Submit Pick'}
        </button>

        {/* Display clear backend validation responses directly on the screen */}
        {state.success && (
          <p className="mt-2 text-sm font-medium text-green-600">{state.message}</p>
        )}
        {state.error && (
          <p className="mt-2 text-sm font-medium text-red-600">{state.error}</p>
        )}
      </form>
    </section>
  )
}