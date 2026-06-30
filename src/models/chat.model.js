import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      enum: ["user", "assistant"],
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    sender: {
      type: String,
      default: null, // "IA", "Julián", or null (for user)
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    chatId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    mode: {
      type: String,
      required: true,
      enum: ["ai", "human"],
      default: "ai",
    },
    history: [messageSchema],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Formatear JSON cuando se consulta
chatSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret._id;
    return ret;
  },
});

export const Chat = mongoose.model("Chat", chatSchema);
export default Chat;
