const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NewspaperPage = sequelize.define('NewspaperPage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },
  file_path: {
    type: DataTypes.STRING(1024),
    allowNull: false
  },
  publication_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  language: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  total_ads_detected: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'newspaper_pages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

const Advertisement = sequelize.define('Advertisement', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  page_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: NewspaperPage,
      key: 'id'
    }
  },
  raw_text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  company: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  brand: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  location: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  contact_info: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  structured_metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  image_path: {
    type: DataTypes.STRING(1024),
    allowNull: true
  },
  bbox_x1: {
    type: DataTypes.REAL,
    allowNull: true
  },
  bbox_y1: {
    type: DataTypes.REAL,
    allowNull: true
  },
  bbox_x2: {
    type: DataTypes.REAL,
    allowNull: true
  },
  bbox_y2: {
    type: DataTypes.REAL,
    allowNull: true
  },
  detection_confidence: {
    type: DataTypes.REAL,
    allowNull: true
  }
}, {
  tableName: 'advertisements',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

const VisualUnderstanding = sequelize.define('VisualUnderstanding', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ad_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Advertisement,
      key: 'id'
    }
  },
  caption: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  detected_objects: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  detected_logos: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  caption_confidence: {
    type: DataTypes.REAL,
    allowNull: true
  }
}, {
  tableName: 'visual_understanding',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// Define Relationships
NewspaperPage.hasMany(Advertisement, { foreignKey: 'page_id', as: 'advertisements' });
Advertisement.belongsTo(NewspaperPage, { foreignKey: 'page_id', as: 'page' });

Advertisement.hasOne(VisualUnderstanding, { foreignKey: 'ad_id', as: 'visual' });
VisualUnderstanding.belongsTo(Advertisement, { foreignKey: 'ad_id', as: 'advertisement' });

module.exports = {
  sequelize,
  NewspaperPage,
  Advertisement,
  VisualUnderstanding
};
