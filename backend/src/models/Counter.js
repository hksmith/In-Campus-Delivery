import mongoose from 'mongoose';

/** Auto-increment counters (human friendly order numbers like #1042) */
const counterSchema = new mongoose.Schema({
  _id: String,
  seq: { type: Number, default: 1000 },
});

export const Counter = mongoose.model('Counter', counterSchema);

export async function nextSequence(name) {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
}
