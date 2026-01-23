import { DataTypes } from "sequelize";
import sequelize from "./sequelize.js";

const AdminDevice = sequelize.define(
  "AdminDevice",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    device_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    user_agent: {
      type: DataTypes.TEXT,
    },
    ip_address: {
      type: DataTypes.STRING,
    },
    last_used: {
      type: DataTypes.DATE,
    },
    trusted: {
      type: DataTypes.TINYINT,
      defaultValue: 1,
    },
  },
  {
    tableName: "admin_devices",
    timestamps: false,
  }
);

export default AdminDevice;
