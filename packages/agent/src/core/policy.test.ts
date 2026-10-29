import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { researchStepBudget, shouldForceTextOnlyStep } from './policy'

test('research can use its full allowance before the separately reserved synthesis iteration', () => {
  for (let stepNumber = 0; stepNumber < 40; stepNumber++) {
    assert.equal(shouldForceTextOnlyStep({ stepNumber, maxSteps: 40 }), false)
  }
  assert.equal(shouldForceTextOnlyStep({ stepNumber: 40, maxSteps: 40 }), true)
  assert.equal(shouldForceTextOnlyStep({ stepNumber: 1, maxSteps: 1 }), true)
  assert.equal(researchStepBudget(1, 0.5), 1)
  assert.equal(researchStepBudget(40, 1.5), 60)
  assert.equal(researchStepBudget(80, 3), 120)
})
