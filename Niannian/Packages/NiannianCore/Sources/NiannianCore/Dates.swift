import Foundation

/// 一个重要时刻在某一天看来的样子：下一次是哪天、还有几天
public struct UpcomingMoment: Identifiable, Hashable, Sendable {
    public var moment: Moment
    /// 下一次发生的日期（当天 0 点）；不重复且已过去时就是原日期
    public var date: Date
    /// 距今天数：未来为还有几天，过去为已经过了几天
    public var days: Int
    public var isPast: Bool
    /// 每年重复的时刻是第几年（生日就是几岁）；原日期没有年份意义或者是第 0 年时为 nil
    public var years: Int?

    public var id: UUID { moment.id }

    public init(moment: Moment, from now: Date = .now, calendar: Calendar = .current) {
        self.moment = moment
        let today = calendar.startOfDay(for: now)
        let original = calendar.startOfDay(for: moment.date)

        if moment.repeatsYearly {
            let next = Self.nextAnniversary(of: original, onOrAfter: today, calendar: calendar)
            date = next
            days = Self.dayDiff(today, next, calendar)
            isPast = false
            let y = calendar.component(.year, from: next) - calendar.component(.year, from: original)
            years = y > 0 ? y : nil
        } else {
            date = original
            let d = Self.dayDiff(today, original, calendar)
            isPast = d < 0
            days = abs(d)
            years = nil
        }
    }

    /// “今天”“明天”“57 天后”“3 天前”
    public var label: String {
        if days == 0 { return "今天" }
        if isPast { return "\(days) 天前" }
        if days == 1 { return "明天" }
        return "\(days) 天后"
    }

    /// 只有数字和单位，给大号数字用：("57", "天后")
    public var labelParts: (number: String, unit: String) {
        if days == 0 { return ("今天", "") }
        return ("\(days)", isPast ? "天前" : "天后")
    }

    /// 某个日期在 today 当天或之后最近的一次周年；2 月 29 日在平年记为 2 月 28 日
    static func nextAnniversary(of original: Date, onOrAfter today: Date, calendar: Calendar) -> Date {
        let md = calendar.dateComponents([.month, .day], from: original)
        let year = calendar.component(.year, from: today)
        for y in [year, year + 1] {
            let d = anniversary(month: md.month ?? 1, day: md.day ?? 1, year: y, calendar: calendar)
            if d >= today { return d }
        }
        return anniversary(month: md.month ?? 1, day: md.day ?? 1, year: year + 1, calendar: calendar)
    }

    static func anniversary(month: Int, day: Int, year: Int, calendar: Calendar) -> Date {
        var c = DateComponents(year: year, month: month, day: day)
        if let d = calendar.date(from: c), calendar.component(.month, from: d) == month {
            return calendar.startOfDay(for: d)
        }
        // 这一年没有这一天（2 月 29 日）
        c.day = day - 1
        return calendar.startOfDay(for: calendar.date(from: c) ?? .now)
    }

    static func dayDiff(_ from: Date, _ to: Date, _ calendar: Calendar) -> Int {
        calendar.dateComponents([.day], from: from, to: to).day ?? 0
    }
}

public extension Date {
    /// “2026年10月14日”
    var chineseDate: String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: self)
        return "\(c.year ?? 0)年\(c.month ?? 0)月\(c.day ?? 0)日"
    }

    /// “10月14日”
    var chineseMonthDay: String {
        let c = Calendar.current.dateComponents([.month, .day], from: self)
        return "\(c.month ?? 0)月\(c.day ?? 0)日"
    }
}
