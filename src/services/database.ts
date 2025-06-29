import Database from 'better-sqlite3';
import { DatabaseConfig, DatabaseError } from '../types/index.js';
import { 
  UserSubscription, 
  UserConfig, 
  PriceAlert, 
  PushHistory,
  SubscriptionManager,
  UserManager,
  AlertManager,
  PushHistoryManager
} from '../types/subscription.js';
import { getLogger } from '../utils/logger.js';
import { generateId } from '../utils/index.js';
import path from 'path';
import fs from 'fs';

export class DatabaseService implements SubscriptionManager, UserManager, AlertManager, PushHistoryManager {
  private db: Database.Database;
  private logger = getLogger();

  constructor(config: DatabaseConfig) {
    // 确保数据目录存在
    const dbDir = path.dirname(config.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(config.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 1000');
    this.db.pragma('temp_store = memory');

    this.initializeTables();
    this.logger.info('Database initialized', { path: config.path });
  }

  private initializeTables(): void {
    // 用户配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        language_code TEXT DEFAULT 'zh',
        timezone TEXT DEFAULT 'Asia/Shanghai',
        is_premium BOOLEAN DEFAULT 0,
        max_subscriptions INTEGER DEFAULT 5,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // 用户订阅表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        subscription_type TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        frequency TEXT DEFAULT '0 * * * *',
        symbols TEXT DEFAULT '[]',
        exchanges TEXT DEFAULT '[]',
        price_threshold REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (user_id),
        UNIQUE(user_id, subscription_type)
      )
    `);

    // 价格警报表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS price_alerts (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        target_price REAL NOT NULL,
        condition TEXT NOT NULL CHECK (condition IN ('above', 'below')),
        is_active BOOLEAN DEFAULT 1,
        triggered BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL,
        triggered_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users (user_id)
      )
    `);

    // 推送历史表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS push_history (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        subscription_type TEXT NOT NULL,
        content TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (user_id)
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_type ON subscriptions (subscription_type);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions (is_active);
      CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON price_alerts (user_id);
      CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts (is_active);
      CREATE INDEX IF NOT EXISTS idx_history_user_id ON push_history (user_id);
      CREATE INDEX IF NOT EXISTS idx_history_timestamp ON push_history (timestamp);
    `);
  }

  // 用户管理方法
  async createUser(user: Omit<UserConfig, 'created_at' | 'updated_at'>): Promise<boolean> {
    const startTime = Date.now();
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO users 
        (user_id, chat_id, username, first_name, last_name, language_code, timezone, is_premium, max_subscriptions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        user.user_id,
        user.chat_id,
        user.username,
        user.first_name,
        user.last_name,
        user.language_code,
        user.timezone,
        user.is_premium ? 1 : 0,
        user.max_subscriptions,
        now,
        now
      );

      this.logger.logDatabaseOperation('INSERT', 'users', true, Date.now() - startTime);
      return true;
    } catch (error) {
      this.logger.logDatabaseOperation('INSERT', 'users', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to create user', error);
    }
  }

  async getUser(userId: number): Promise<UserConfig | null> {
    const startTime = Date.now();
    try {
      const stmt = this.db.prepare('SELECT * FROM users WHERE user_id = ?');
      const row = stmt.get(userId) as any;
      
      this.logger.logDatabaseOperation('SELECT', 'users', true, Date.now() - startTime);
      
      if (!row) return null;
      
      return {
        ...row,
        is_premium: Boolean(row.is_premium)
      };
    } catch (error) {
      this.logger.logDatabaseOperation('SELECT', 'users', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to get user', error);
    }
  }

  async updateUser(userId: number, updates: Partial<UserConfig>): Promise<boolean> {
    const startTime = Date.now();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'user_id');
      if (fields.length === 0) return true;

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => {
        const value = (updates as any)[field];
        return field === 'is_premium' ? (value ? 1 : 0) : value;
      });
      
      const stmt = this.db.prepare(`
        UPDATE users SET ${setClause}, updated_at = ? WHERE user_id = ?
      `);
      
      const result = stmt.run(...values, new Date().toISOString(), userId);
      
      this.logger.logDatabaseOperation('UPDATE', 'users', true, Date.now() - startTime);
      return result.changes > 0;
    } catch (error) {
      this.logger.logDatabaseOperation('UPDATE', 'users', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to update user', error);
    }
  }

  async deleteUser(userId: number): Promise<boolean> {
    const startTime = Date.now();
    try {
      const transaction = this.db.transaction(() => {
        // 删除相关数据
        this.db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(userId);
        this.db.prepare('DELETE FROM price_alerts WHERE user_id = ?').run(userId);
        this.db.prepare('DELETE FROM push_history WHERE user_id = ?').run(userId);
        
        // 删除用户
        const result = this.db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
        return result.changes > 0;
      });
      
      const success = transaction();
      this.logger.logDatabaseOperation('DELETE', 'users', true, Date.now() - startTime);
      return success;
    } catch (error) {
      this.logger.logDatabaseOperation('DELETE', 'users', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to delete user', error);
    }
  }

  // 订阅管理方法
  async addSubscription(subscription: Omit<UserSubscription, 'created_at' | 'updated_at'>): Promise<boolean> {
    const startTime = Date.now();
    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO subscriptions 
        (user_id, chat_id, subscription_type, is_active, frequency, symbols, exchanges, price_threshold, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        subscription.user_id,
        subscription.chat_id,
        subscription.subscription_type,
        subscription.is_active ? 1 : 0,
        subscription.frequency,
        JSON.stringify(subscription.symbols),
        JSON.stringify(subscription.exchanges),
        subscription.price_threshold,
        now,
        now
      );

      this.logger.logDatabaseOperation('INSERT', 'subscriptions', true, Date.now() - startTime);
      return true;
    } catch (error) {
      this.logger.logDatabaseOperation('INSERT', 'subscriptions', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to add subscription', error);
    }
  }

  async removeSubscription(userId: number, subscriptionType: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const stmt = this.db.prepare('DELETE FROM subscriptions WHERE user_id = ? AND subscription_type = ?');
      const result = stmt.run(userId, subscriptionType);
      
      this.logger.logDatabaseOperation('DELETE', 'subscriptions', true, Date.now() - startTime);
      return result.changes > 0;
    } catch (error) {
      this.logger.logDatabaseOperation('DELETE', 'subscriptions', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to remove subscription', error);
    }
  }

  async getUserSubscriptions(userId: number): Promise<UserSubscription[]> {
    const startTime = Date.now();
    try {
      const stmt = this.db.prepare('SELECT * FROM subscriptions WHERE user_id = ?');
      const rows = stmt.all(userId) as any[];
      
      this.logger.logDatabaseOperation('SELECT', 'subscriptions', true, Date.now() - startTime);
      
      return rows.map(row => ({
        ...row,
        is_active: Boolean(row.is_active),
        symbols: JSON.parse(row.symbols || '[]'),
        exchanges: JSON.parse(row.exchanges || '[]')
      }));
    } catch (error) {
      this.logger.logDatabaseOperation('SELECT', 'subscriptions', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to get user subscriptions', error);
    }
  }

  async updateSubscription(userId: number, subscriptionType: string, updates: Partial<UserSubscription>): Promise<boolean> {
    const startTime = Date.now();
    try {
      const fields = Object.keys(updates).filter(key => !['user_id', 'subscription_type'].includes(key));
      if (fields.length === 0) return true;

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => {
        const value = (updates as any)[field];
        if (field === 'is_active') return value ? 1 : 0;
        if (field === 'symbols' || field === 'exchanges') return JSON.stringify(value);
        return value;
      });
      
      const stmt = this.db.prepare(`
        UPDATE subscriptions SET ${setClause}, updated_at = ? WHERE user_id = ? AND subscription_type = ?
      `);
      
      const result = stmt.run(...values, new Date().toISOString(), userId, subscriptionType);
      
      this.logger.logDatabaseOperation('UPDATE', 'subscriptions', true, Date.now() - startTime);
      return result.changes > 0;
    } catch (error) {
      this.logger.logDatabaseOperation('UPDATE', 'subscriptions', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to update subscription', error);
    }
  }

  async getActiveSubscriptions(subscriptionType?: string): Promise<UserSubscription[]> {
    const startTime = Date.now();
    try {
      let query = 'SELECT * FROM subscriptions WHERE is_active = 1';
      const params: any[] = [];
      
      if (subscriptionType) {
        query += ' AND subscription_type = ?';
        params.push(subscriptionType);
      }
      
      const stmt = this.db.prepare(query);
      const rows = stmt.all(...params) as any[];
      
      this.logger.logDatabaseOperation('SELECT', 'subscriptions', true, Date.now() - startTime);
      
      return rows.map(row => ({
        ...row,
        is_active: Boolean(row.is_active),
        symbols: JSON.parse(row.symbols || '[]'),
        exchanges: JSON.parse(row.exchanges || '[]')
      }));
    } catch (error) {
      this.logger.logDatabaseOperation('SELECT', 'subscriptions', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to get active subscriptions', error);
    }
  }

  // 价格警报管理方法
  async createAlert(alert: Omit<PriceAlert, 'id' | 'created_at'>): Promise<string> {
    const startTime = Date.now();
    try {
      const id = generateId();
      const now = new Date().toISOString();
      
      const stmt = this.db.prepare(`
        INSERT INTO price_alerts 
        (id, user_id, chat_id, symbol, target_price, condition, is_active, triggered, created_at, triggered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        alert.user_id,
        alert.chat_id,
        alert.symbol,
        alert.target_price,
        alert.condition,
        alert.is_active ? 1 : 0,
        alert.triggered ? 1 : 0,
        now,
        alert.triggered_at
      );

      this.logger.logDatabaseOperation('INSERT', 'price_alerts', true, Date.now() - startTime);
      return id;
    } catch (error) {
      this.logger.logDatabaseOperation('INSERT', 'price_alerts', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to create alert', error);
    }
  }

  async getUserAlerts(userId: number): Promise<PriceAlert[]> {
    const startTime = Date.now();
    try {
      const stmt = this.db.prepare('SELECT * FROM price_alerts WHERE user_id = ? ORDER BY created_at DESC');
      const rows = stmt.all(userId) as any[];
      
      this.logger.logDatabaseOperation('SELECT', 'price_alerts', true, Date.now() - startTime);
      
      return rows.map(row => ({
        ...row,
        is_active: Boolean(row.is_active),
        triggered: Boolean(row.triggered)
      }));
    } catch (error) {
      this.logger.logDatabaseOperation('SELECT', 'price_alerts', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to get user alerts', error);
    }
  }

  async updateAlert(alertId: string, updates: Partial<PriceAlert>): Promise<boolean> {
    const startTime = Date.now();
    try {
      const fields = Object.keys(updates).filter(key => key !== 'id');
      if (fields.length === 0) return true;

      const setClause = fields.map(field => `${field} = ?`).join(', ');
      const values = fields.map(field => {
        const value = (updates as any)[field];
        if (field === 'is_active' || field === 'triggered') return value ? 1 : 0;
        return value;
      });
      
      const stmt = this.db.prepare(`UPDATE price_alerts SET ${setClause} WHERE id = ?`);
      const result = stmt.run(...values, alertId);
      
      this.logger.logDatabaseOperation('UPDATE', 'price_alerts', true, Date.now() - startTime);
      return result.changes > 0;
    } catch (error) {
      this.logger.logDatabaseOperation('UPDATE', 'price_alerts', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to update alert', error);
    }
  }

  async deleteAlert(alertId: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const stmt = this.db.prepare('DELETE FROM price_alerts WHERE id = ?');
      const result = stmt.run(alertId);
      
      this.logger.logDatabaseOperation('DELETE', 'price_alerts', true, Date.now() - startTime);
      return result.changes > 0;
    } catch (error) {
      this.logger.logDatabaseOperation('DELETE', 'price_alerts', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to delete alert', error);
    }
  }

  async getActiveAlerts(): Promise<PriceAlert[]> {
    const startTime = Date.now();
    try {
      const stmt = this.db.prepare('SELECT * FROM price_alerts WHERE is_active = 1 AND triggered = 0');
      const rows = stmt.all() as any[];
      
      this.logger.logDatabaseOperation('SELECT', 'price_alerts', true, Date.now() - startTime);
      
      return rows.map(row => ({
        ...row,
        is_active: Boolean(row.is_active),
        triggered: Boolean(row.triggered)
      }));
    } catch (error) {
      this.logger.logDatabaseOperation('SELECT', 'price_alerts', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to get active alerts', error);
    }
  }

  async triggerAlert(alertId: string): Promise<boolean> {
    const startTime = Date.now();
    try {
      const stmt = this.db.prepare('UPDATE price_alerts SET triggered = 1, triggered_at = ? WHERE id = ?');
      const result = stmt.run(new Date().toISOString(), alertId);
      
      this.logger.logDatabaseOperation('UPDATE', 'price_alerts', true, Date.now() - startTime);
      return result.changes > 0;
    } catch (error) {
      this.logger.logDatabaseOperation('UPDATE', 'price_alerts', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to trigger alert', error);
    }
  }

  // 推送历史管理方法
  async addRecord(record: Omit<PushHistory, 'id' | 'timestamp'>): Promise<string> {
    const startTime = Date.now();
    try {
      const id = generateId();
      const now = new Date().toISOString();
      
      const stmt = this.db.prepare(`
        INSERT INTO push_history 
        (id, user_id, chat_id, subscription_type, content, success, error_message, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        id,
        record.user_id,
        record.chat_id,
        record.subscription_type,
        record.content,
        record.success ? 1 : 0,
        record.error_message,
        now
      );

      this.logger.logDatabaseOperation('INSERT', 'push_history', true, Date.now() - startTime);
      return id;
    } catch (error) {
      this.logger.logDatabaseOperation('INSERT', 'push_history', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to add push record', error);
    }
  }

  async getUserHistory(userId: number, limit: number = 50): Promise<PushHistory[]> {
    const startTime = Date.now();
    try {
      const stmt = this.db.prepare('SELECT * FROM push_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?');
      const rows = stmt.all(userId, limit) as any[];
      
      this.logger.logDatabaseOperation('SELECT', 'push_history', true, Date.now() - startTime);
      
      return rows.map(row => ({
        ...row,
        success: Boolean(row.success)
      }));
    } catch (error) {
      this.logger.logDatabaseOperation('SELECT', 'push_history', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to get user history', error);
    }
  }

  async getHistoryByType(subscriptionType: string, limit: number = 100): Promise<PushHistory[]> {
    const startTime = Date.now();
    try {
      const stmt = this.db.prepare('SELECT * FROM push_history WHERE subscription_type = ? ORDER BY timestamp DESC LIMIT ?');
      const rows = stmt.all(subscriptionType, limit) as any[];
      
      this.logger.logDatabaseOperation('SELECT', 'push_history', true, Date.now() - startTime);
      
      return rows.map(row => ({
        ...row,
        success: Boolean(row.success)
      }));
    } catch (error) {
      this.logger.logDatabaseOperation('SELECT', 'push_history', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to get history by type', error);
    }
  }

  async cleanOldRecords(daysToKeep: number = 30): Promise<number> {
    const startTime = Date.now();
    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
      const stmt = this.db.prepare('DELETE FROM push_history WHERE timestamp < ?');
      const result = stmt.run(cutoffDate);
      
      this.logger.logDatabaseOperation('DELETE', 'push_history', true, Date.now() - startTime);
      return result.changes;
    } catch (error) {
      this.logger.logDatabaseOperation('DELETE', 'push_history', false, Date.now() - startTime, (error as Error).message);
      throw new DatabaseError('Failed to clean old records', error);
    }
  }

  // 数据库维护方法
  close(): void {
    this.db.close();
    this.logger.info('Database connection closed');
  }

  backup(backupPath: string): void {
    this.db.backup(backupPath);
    this.logger.info('Database backup created', { path: backupPath });
  }

  vacuum(): void {
    this.db.exec('VACUUM');
    this.logger.info('Database vacuum completed');
  }

  getStats(): any {
    const stats = {
      users: this.db.prepare('SELECT COUNT(*) as count FROM users').get(),
      subscriptions: this.db.prepare('SELECT COUNT(*) as count FROM subscriptions').get(),
      alerts: this.db.prepare('SELECT COUNT(*) as count FROM price_alerts').get(),
      history: this.db.prepare('SELECT COUNT(*) as count FROM push_history').get()
    };
    return stats;
  }
}
