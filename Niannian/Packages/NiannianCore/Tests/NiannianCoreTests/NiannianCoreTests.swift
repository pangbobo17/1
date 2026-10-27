import XCTest
@testable import NiannianCore

final class NiannianCoreTests: XCTestCase {
    var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        return c
    }()

    func day(_ y: Int, _ m: Int, _ d: Int, hour: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: hour))!
    }

    let pid = UUID()

    func testYearlyLaterThisYear() {
        let m = Moment(personID: pid, title: "生日", kind: .birthday, date: day(2015, 12, 10))
        let u = UpcomingMoment(moment: m, from: day(2026, 10, 14, hour: 20), calendar: calendar)
        XCTAssertEqual(u.days, 57)
        XCTAssertEqual(u.label, "57 天后")
        XCTAssertEqual(u.years, 11)
        XCTAssertFalse(u.isPast)
    }

    func testYearlyAlreadyPassedRollsToNextYear() {
        let m = Moment(personID: pid, title: "生日", kind: .birthday, date: day(1990, 3, 1))
        let u = UpcomingMoment(moment: m, from: day(2026, 10, 14), calendar: calendar)
        XCTAssertEqual(u.date, day(2027, 3, 1))
        XCTAssertEqual(u.years, 37)
    }

    func testYearlyToday() {
        let m = Moment(personID: pid, title: "纪念日", kind: .anniversary, date: day(2020, 10, 14))
        let u = UpcomingMoment(moment: m, from: day(2026, 10, 14, hour: 23), calendar: calendar)
        XCTAssertEqual(u.days, 0)
        XCTAssertEqual(u.label, "今天")
    }

    func testLeapDayInCommonYear() {
        let m = Moment(personID: pid, title: "生日", kind: .birthday, date: day(2000, 2, 29))
        let u = UpcomingMoment(moment: m, from: day(2026, 1, 1), calendar: calendar)
        XCTAssertEqual(u.date, day(2026, 2, 28))
        let leap = UpcomingMoment(moment: m, from: day(2028, 1, 1), calendar: calendar)
        XCTAssertEqual(leap.date, day(2028, 2, 29))
    }

    func testOneOffPast() {
        let m = Moment(personID: pid, title: "考试", kind: .exam, date: day(2026, 10, 11))
        XCTAssertFalse(m.repeatsYearly)
        let u = UpcomingMoment(moment: m, from: day(2026, 10, 14), calendar: calendar)
        XCTAssertTrue(u.isPast)
        XCTAssertEqual(u.label, "3 天前")
    }

    func testUpcomingOrder() {
        let lib = Library(moments: [
            Moment(personID: pid, title: "过去", kind: .exam, date: day(2026, 10, 1)),
            Moment(personID: pid, title: "远", kind: .birthday, date: day(2000, 5, 1)),
            Moment(personID: pid, title: "近", kind: .exam, date: day(2026, 10, 20)),
        ])
        let titles = lib.upcoming(from: day(2026, 10, 14), calendar: calendar).map(\.moment.title)
        XCTAssertEqual(titles, ["近", "远", "过去"])
    }

    func testRemovePerson() {
        let other = Person(name: "岳父")
        var lib = Library(
            people: [Person(id: pid, name: "小菠萝"), other],
            moments: [Moment(personID: pid, title: "x", date: .now)],
            memories: [Memory(personID: pid, text: "y"), Memory(personID: other.id, text: "z")],
            currentPersonID: pid,
            widget: WidgetSettings(personIDs: [pid, other.id])
        )
        lib.removePerson(pid)
        XCTAssertEqual(lib.people.map(\.name), ["岳父"])
        XCTAssertTrue(lib.moments.isEmpty)
        XCTAssertEqual(lib.memories.count, 1)
        XCTAssertEqual(lib.currentPersonID, other.id)
        XCTAssertEqual(lib.widget.personIDs, [other.id])
    }

    func testBackupRoundTrip() throws {
        let p = Person(id: pid, name: "小菠萝", avatarVersion: 2)
        let lib = Library(people: [p], memories: [Memory(personID: pid, text: "今天没去上课", date: day(2026, 10, 14))])
        let data = try Backup(library: lib, avatars: [pid: Data([1, 2, 3])]).encoded()
        let back = try Backup.decode(data)
        XCTAssertEqual(back.library, lib)
        XCTAssertEqual(back.avatars[pid], Data([1, 2, 3]))
    }

    func testOldFileWithoutWidgetDecodes() throws {
        let json = #"{"people":[],"moments":[],"memories":[]}"#
        let lib = try SharedStorage.decoder.decode(Library.self, from: Data(json.utf8))
        XCTAssertEqual(lib.widget, WidgetSettings())
    }

    func testMerge() {
        let a = Person(name: "A"), b = Person(name: "B")
        var mine = Library(people: [a])
        var b2 = b
        b2.name = "B2"
        mine.merge(Library(people: [b2]))
        XCTAssertEqual(mine.people.map(\.name), ["A", "B2"])
        var a2 = a
        a2.name = "A2"
        mine.merge(Library(people: [a2]))
        XCTAssertEqual(Set(mine.people.map(\.name)), ["A2", "B2"])
    }

    func testDisplayTitle() {
        XCTAssertEqual(Memory(personID: pid, title: " ", text: "第一行\n第二行").displayTitle, "第一行")
        XCTAssertEqual(Memory(personID: pid, title: "标题", text: "x").displayTitle, "标题")
    }

    func testPromptContext() {
        let p = Person(id: pid, name: "小菠萝", relation: "儿子", about: "喜欢乐高和编程")
        let lib = Library(
            people: [p],
            moments: [Moment(personID: pid, title: "GESP 考试", kind: .exam, date: day(2026, 12, 10))],
            memories: [Memory(personID: pid, title: "看电视超时", text: "看电视超时被批评", date: day(2026, 10, 12))]
        )
        let ctx = Prompts.context(for: p, in: lib, now: day(2026, 10, 14))
        XCTAssertTrue(ctx.contains("名字：小菠萝（用户的儿子）"))
        XCTAssertTrue(ctx.contains("GESP 考试"))
        XCTAssertTrue(ctx.contains("看电视超时被批评"))
        XCTAssertLessThanOrEqual(Prompts.context(for: p, in: lib, maxCharacters: 20).count, 20)
        XCTAssertTrue(Prompts.suggestions(for: p, in: lib, now: day(2026, 10, 14))[1].contains("GESP 考试"))
    }
}
