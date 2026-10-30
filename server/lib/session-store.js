import session from "express-session";
export class MongoSessionStore extends session.Store {
  constructor(db) {
    super();
    this.collection = db.collection("sessions");
  }
  get(sid, callback) {
    this.collection
      .findOne({ _id: sid, expiresAt: { $gt: Date.now() } })
      .then((doc) => callback(null, doc ? doc.data : null))
      .catch(callback);
  }
  set(sid, data, callback = () => {}) {
    const expiresAt = data.cookie.expires
      ? new Date(data.cookie.expires).getTime()
      : Date.now() + 86400000;
    this.collection
      .updateOne(
        { _id: sid },
        { $set: { data, expiresAt } },
        { upsert: true },
      )
      .then(() => callback())
      .catch(callback);
  }
  destroy(sid, callback = () => {}) {
    this.collection
      .deleteOne({ _id: sid })
      .then(() => callback())
      .catch(callback);
  }
  touch(sid, data, callback = () => {}) {
    this.collection
      .updateOne(
        { _id: sid },
        { $set: { expiresAt: new Date(data.cookie.expires).getTime() } },
      )
      .then(() => callback())
      .catch(callback);
  }
  async prune() {
    await this.collection.deleteMany({ expiresAt: { $lte: Date.now() } });
  }
}
