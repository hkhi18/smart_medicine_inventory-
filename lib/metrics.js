
// Accuracy for one medicine/model: never below 0
export const accuracyFromMape = (mape) => Math.max(0, 100 - mape);

// Green at 60% or more, red below 60%
export const accuracyColor = (accuracy) => (accuracy >= 60 ? '#16a34a' : '#dc2626');