import mongoose from "mongoose";

const testimonialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      default: "@anonimo",
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    img: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

// Formatear JSON cuando se devuelve desde la base de datos (por ejemplo, eliminando _id o transformándolo a id si es necesario)
testimonialSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret._id;
    return ret;
  },
});

export const Testimonial = mongoose.model("Testimonial", testimonialSchema);
export default Testimonial;
